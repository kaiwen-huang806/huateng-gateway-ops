import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createDevices, deviceMeta, floors, rooms } from '@/mock/gateway'
import type {
  Device,
  DeviceLogRow,
  DeviceStatus,
  LogLevel,
  OtaBatch,
  OtaBatchStats,
  OtaFailureCode,
  OtaFault,
  UpgradeKind,
} from '@/types/gateway'
import { latestLogOf, logTimestamp, nowLogAt } from '@/utils/logs'

// 升级进度按 tick 推进；真实环境里这些数字来自网关上报。
const OTA_TICK_MS = 250
const OTA_STEP = 13
// 超过这个时间没有任何进度就判超时。真实阈值由网关侧决定，这里只为演示可控。
const OTA_STALL_MS = 6000
// 同时下发的设备上限。真实并发由网关决定，这里先按 5 台演示。
const OTA_CONCURRENCY = 5

// 每类失败的展示文案。错误码与文案分开，将来对齐网关协议时只改这张表。
const OTA_FAILURE_MESSAGE: Record<OtaFailureCode, string> = {
  checksum: '固件校验失败，请确认上传的包完整',
  write: '写入失败，设备可能仍停留在旧版本',
  timeout: '设备无响应（超时）',
  offline: '设备离线，无法下发；确认设备在线后可重试',
}

// 可注入的故障（不含 offline：那是排队期间掉线才出现的真实情况）。
type InjectableFault = Exclude<OtaFailureCode, 'offline'>

// 注入的故障在进度推进到哪一步才暴露：校验失败在开头、写入失败在最后一步、超时停在中途。
const OTA_FAULT_FAIL_AT: Record<InjectableFault, number> = {
  checksum: 39,
  write: 100,
  timeout: 39,
}

export const useGatewayStore = defineStore('gateway', () => {
  const devices = ref<Device[]>(createDevices())
  const selectedFloor = ref('3F')
  const selectedDevice = ref<Device | null>(null)
  const deviceTab = ref<'status' | 'control' | 'log' | 'ota'>('status')
  const toastMessage = ref('')
  const toastKind = ref<'ok' | 'err'>('ok')
  // 最近一次上传的固件包。不连云时网关没有可信的"最新版本"，目标版本完全由这次上传的包决定。
  const uploadedFirmware = ref<{ name: string; fileName: string; version: string } | null>(null)
  // 故障注入：仅用于开发演示，决定下一次下发升级的结果；生产构建里对应控件会被移除。
  const otaFault = ref<OtaFault>('none')
  // 当前（或最近一次）批量升级。前端先派生 id 占位，对接后由网关返回。
  const otaBatch = ref<OtaBatch | null>(null)
  // 已经报过"批次结束"的批次 id，避免重复汇总。
  const batchNotified = new Set<string>()
  // 本次待确认的升级是否来自批量模式（批量模式下即使只选 1 台也走批次面板）。
  const pendingIsBatch = ref(false)
  let toastTimer: number | undefined

  const onlineDevices = computed(() => devices.value.filter((device) => device.online).length)
  const floorRooms = computed(() => rooms.filter((room) => room.floor === selectedFloor.value))
  // 全量日志：按时间倒序的设备日志全量。
  const allLogs = computed(() =>
    devices.value
      .flatMap((device) =>
        device.logs.map((log) => ({
          ...log,
          room: device.room,
          device: device.name,
          floor: device.floor,
        })),
      )
      .sort((left, right) => logTimestamp(right) - logTimestamp(left)),
  )
  // 概览页「最新告警」的口径：只看异常，正常的 INFO 流水不进告警列表。
  const alertLogs = computed(() => allLogs.value.filter((log) => log.level !== 'INFO'))
  // 日志中心的口径：每台设备只保留最新一条，历史记录在弹窗里按日期查。
  // 只看最新一条是产品要求——同一台设备的旧日志不再平铺在表格里。
  const deviceLogs = computed<DeviceLogRow[]>(() =>
    devices.value
      .map((device) => ({ device, log: latestLogOf(device) }))
      .filter((row): row is DeviceLogRow => row.log !== null)
      .sort((left, right) => logTimestamp(right.log) - logTimestamp(left.log)),
  )

  // 当前批次包含的设备，顺序就是提交时的顺序（队列按这个顺序放行）。
  const batchDevices = computed(() => {
    const batch = otaBatch.value
    if (!batch) return [] as Device[]
    return batch.deviceIds
      .map((id) => devices.value.find((device) => device.id === id))
      .filter((device): device is Device => Boolean(device))
  })

  const batchStats = computed<OtaBatchStats>(() => {
    const list = batchDevices.value
    const countOf = (status: Device['otaStatus']) =>
      list.filter((device) => device.otaStatus === status).length
    const queued = countOf('queued')
    const running = list.filter((device) => otaBusy(device)).length
    const success = countOf('success')
    const failed = countOf('failed')
    const stopped = countOf('stopped')
    return {
      total: list.length,
      queued,
      running,
      success,
      failed,
      stopped,
      settled: success + failed + stopped,
      finished: list.length > 0 && queued === 0 && running === 0,
    }
  })

  // 批次是否仍在推进：还有设备在排队或下发中。
  const batchRunning = computed(() => batchStats.value.total > 0 && !batchStats.value.finished)

  function statusOf(device: Device | undefined): DeviceStatus {
    if (!device?.online) return 'err'
    if (device.logs.some((log) => log.level === 'ERROR')) return 'warn'
    return 'ok'
  }

  function statusText(status: DeviceStatus) {
    return status === 'ok' ? '正常' : status === 'warn' ? '注意' : '异常'
  }

  function notify(message: string, kind: 'ok' | 'err' = 'ok') {
    toastMessage.value = message
    toastKind.value = kind
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => (toastMessage.value = ''), 2600)
  }

  function openDevice(device: Device) {
    selectedDevice.value = device
    deviceTab.value = 'status'
  }

  // OTA 列表里的「详情」：打开设备弹窗并直接停在 OTA 页签。
  function openDeviceOta(device: Device) {
    selectedDevice.value = device
    deviceTab.value = 'ota'
  }

  function addLog(device: Device, level: LogLevel, message: string) {
    // 现场产生的日志时间取当前时刻；展示列统一写「刚刚」，完整时间在日志弹窗里能看到。
    device.logs.unshift({
      at: nowLogAt(),
      time: '刚刚',
      level,
      message,
    })
  }

  function nowLabel() {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  }

  function setDeviceParam(device: Device, key: string, value: string | number | boolean) {
    device.params[key] = value
    addLog(device, 'INFO', `下发指令 → ${key}=${String(value)}，响应：成功`)
    notify(`${device.room} ${device.name} 参数已更新`)
  }

  function togglePower(device: Device) {
    device.params.power = !device.params.power
    addLog(device, 'INFO', `${device.name} ${device.params.power ? '开启' : '关闭'}，响应：成功`)
    notify(`${device.room} ${device.name} 已${device.params.power ? '开启' : '关闭'}`)
  }

  // 版本比较：v 前缀可省，逐段比数字，缺位按 0 处理（v2.4 等于 v2.4.0）。
  function compareVersions(left: string, right: string) {
    const segments = (version: string) =>
      version
        .replace(/^v/i, '')
        .split('.')
        .map((part) => Number.parseInt(part, 10) || 0)
    const a = segments(left)
    const b = segments(right)
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const diff = (a[index] ?? 0) - (b[index] ?? 0)
      if (diff) return diff > 0 ? 1 : -1
    }
    return 0
  }

  // 目标固件相对设备当前固件是升级、同版本重刷还是降级。降级由调用方负责二次确认。
  function upgradeKind(device: Device, targetVersion: string): UpgradeKind {
    const diff = compareVersions(targetVersion, device.firmware)
    return diff > 0 ? 'upgrade' : diff < 0 ? 'downgrade' : 'reflash'
  }

  // 处在"进行中"的两个阶段：传输固件与写入固件。
  function otaBusy(device: Device) {
    return device.otaStatus === 'transferring' || device.otaStatus === 'installing'
  }

  function otaStageText(device: Device) {
    const stage = device.otaStatus === 'installing' ? '写入固件' : '传输固件'
    return `${stage}… ${device.progress}% · 请勿断电`
  }

  function finishUpgrade(device: Device, targetVersion: string) {
    device.progress = 100
    device.firmware = targetVersion
    device.otaStatus = 'success'
    device.otaError = null
    device.otaUpdatedAt = nowLabel()
    addLog(device, 'INFO', `固件升级完成 → ${targetVersion}`)
    notify(`${device.room} ${device.name} 已升级至 ${targetVersion}`)
  }

  function failUpgrade(device: Device, code: OtaFailureCode) {
    const message = OTA_FAILURE_MESSAGE[code]
    device.otaStatus = 'failed'
    device.otaError = { code, message, at: nowLabel() }
    addLog(device, 'ERROR', `固件升级失败 → ${device.otaTarget ?? '未知版本'}（${message}）`)
    notify(`${device.room} ${device.name} 升级失败：${message}`, 'err')
  }

  // 解析这一次下发要注入的故障。'batch-partial' 用来演示"批次内部分失败"：
  // 每 5 台里的后 3 台在写入阶段失败，前 2 台正常（并发上限也是 5，正好一台一台地演示）。
  function resolveFault(device: Device): InjectableFault | null {
    const fault = otaFault.value
    if (fault === 'none') return null
    if (fault === 'batch-partial') {
      const batch = otaBatch.value
      const index = batch ? batch.deviceIds.indexOf(device.id) : -1
      return index >= 0 && index % 5 >= 2 ? 'write' : null
    }
    return fault
  }

  // 真正下发一台设备（单台升级和队列放行都走这里）。
  function launchUpgrade(device: Device, targetVersion: string) {
    const kind = upgradeKind(device, targetVersion)
    const fault = resolveFault(device)
    const failAt = fault ? OTA_FAULT_FAIL_AT[fault] : null
    device.otaStatus = 'transferring'
    device.otaTarget = targetVersion
    device.otaError = null
    device.otaAttempts += 1
    device.progress = 0
    const action =
      kind === 'upgrade'
        ? '开始固件升级'
        : kind === 'reflash'
          ? '开始固件重刷（同版本覆盖）'
          : '开始固件降级'
    addLog(
      device,
      kind === 'downgrade' ? 'WARN' : 'INFO',
      `${action} → ${targetVersion}${uploadedFirmware.value ? `（${uploadedFirmware.value.name}）` : ''}`,
    )
    const timer = window.setInterval(() => {
      device.progress = Math.min(device.progress + OTA_STEP, 100)
      if (device.progress >= 65) device.otaStatus = 'installing'
      if (failAt !== null && device.progress >= failAt) {
        window.clearInterval(timer)
        // 超时不当场判死：进度先卡住，超过阈值才给失败结论，更贴近真实表现。
        if (fault === 'timeout') {
          window.setTimeout(() => failUpgrade(device, 'timeout'), OTA_STALL_MS)
        } else if (fault) {
          failUpgrade(device, fault)
        }
        if (!device.otaBatchId) return
        pumpQueue()
        return
      }
      if (device.progress >= 100) {
        window.clearInterval(timer)
        finishUpgrade(device, targetVersion)
        if (device.otaBatchId) pumpQueue()
      }
    }, OTA_TICK_MS)
  }

  // 单台升级入口：批次进行中不允许下发"批次外"的设备。
  function startUpgrade(device: Device, targetVersion: string) {
    if (!canUpgrade(device)) return
    if (batchRunning.value && device.otaBatchId !== otaBatch.value?.id) {
      notify('当前批次升级中，完成或停止后才能下发新设备', 'err')
      return
    }
    launchUpgrade(device, targetVersion)
  }

  // 单台能否升级只看设备自身状态：在线且不在升级中。目标版本由本次上传的固件包决定，
  // 因此不再和「网关记录的版本」比较——否则设备全部对齐后连上传固件的入口都会打不开。
  function canUpgrade(device: Device) {
    return device.online && !otaBusy(device)
  }

  // 失败重试复用上一次的目标版本与固件包，不需要重新选文件。
  function retryUpgrade(device: Device) {
    const target = device.otaTarget
    if (!target) return
    if (!canUpgrade(device)) {
      notify(`${device.room} ${device.name} 当前无法重试：设备离线或正在升级`, 'err')
      return
    }
    // 批次内的重试回到队列尾部等槽位，不重新上传固件；单台升级直接下发。
    if (device.otaBatchId && device.otaBatchId === otaBatch.value?.id) {
      device.otaStatus = 'queued'
      device.progress = 0
      device.otaError = null
      batchNotified.delete(device.otaBatchId)
      pumpQueue()
      return
    }
    launchUpgrade(device, target)
  }

  function batchSummaryText(stats: OtaBatchStats) {
    const parts = [`成功 ${stats.success} 台`]
    if (stats.failed) parts.push(`失败 ${stats.failed} 台`)
    if (stats.stopped) parts.push(`停止下发 ${stats.stopped} 台`)
    return `批量升级结束：${parts.join(' / ')}`
  }

  // 队列推进：按并发上限把排队的设备放出来，批次全部到终态时给一条汇总。
  // 这里同时也是"停止下发"和"设备掉线"的收口点。
  function pumpQueue() {
    const batch = otaBatch.value
    if (!batch) return
    // 排队期间掉线的设备不会有人替它报错，在这里判掉，否则批次永远结束不了。
    batchDevices.value
      .filter((device) => device.otaStatus === 'queued' && !device.online)
      .forEach((device) => failUpgrade(device, 'offline'))
    for (const device of batchDevices.value) {
      if (device.otaStatus !== 'queued') continue
      const running = devices.value.filter((item) => otaBusy(item)).length
      if (running >= OTA_CONCURRENCY) break
      launchUpgrade(device, batch.targetVersion)
    }
    const stats = batchStats.value
    if (stats.finished && !batchNotified.has(batch.id)) {
      batchNotified.add(batch.id)
      notify(batchSummaryText(stats), stats.failed || stats.stopped ? 'err' : 'ok')
    }
  }

  // 批量升级：先整批排队，再按并发上限逐台放行。
  function enqueueUpgrades(targets: Device[], targetVersion: string) {
    const batch: OtaBatch = {
      id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      targetVersion,
      firmwareName: uploadedFirmware.value?.fileName ?? '本地固件',
      startedAt: nowLabel(),
      deviceIds: targets.map((device) => device.id),
    }
    otaBatch.value = batch
    targets.forEach((device) => {
      device.otaBatchId = batch.id
      device.otaTarget = targetVersion
      device.otaError = null
      device.otaAttempts = 0
      device.progress = 0
      device.otaStatus = 'queued'
    })
    notify(`已提交 ${targets.length} 台设备升级至 ${targetVersion}`)
    pumpQueue()
  }

  // 重试本批次里失败的设备：回到队列尾部，复用批次的目标版本与固件包。
  function retryFailedInBatch() {
    const targets = batchDevices.value.filter((device) => device.otaStatus === 'failed')
    if (!targets.length) return
    const batch = otaBatch.value
    if (batch) batchNotified.delete(batch.id)
    targets.forEach((device) => {
      device.otaStatus = 'queued'
      device.progress = 0
      device.otaError = null
    })
    notify(`已把 ${targets.length} 台失败设备重新排入队列`)
    pumpQueue()
  }

  // 停止后续下发：已经在刷固件的设备停不下来，只能作废还没下发的那些。
  function stopBatchQueue() {
    const queued = batchDevices.value.filter((device) => device.otaStatus === 'queued')
    if (!queued.length) {
      notify('当前没有等待下发的设备', 'err')
      return
    }
    queued.forEach((device) => {
      device.otaStatus = 'stopped'
      device.progress = 0
      addLog(device, 'WARN', `固件升级已停止下发 → ${device.otaTarget ?? '未知版本'}`)
    })
    notify(`已停止后续下发，${queued.length} 台设备未下发`)
    pumpQueue()
  }

  // 升级不可逆：单台与批量都先弹上传固件弹窗，选好本地固件才真正下发。
  const pendingUpgrade = ref<Device[]>([])

  function requestUpgrade(device: Device) {
    if (!canUpgrade(device)) return
    if (batchRunning.value) {
      notify('当前批次升级中，完成或停止后才能下发新设备', 'err')
      return
    }
    pendingIsBatch.value = false
    pendingUpgrade.value = [device]
  }

  // 批量升级：只接受同一类型设备（空调与灯不能同批），提交瞬间再按可升级规则过滤一次，
  // 跳过勾选期间掉线或已升完的设备。
  function requestUpgradeMany(devicesToUpgrade: Device[]) {
    if (batchRunning.value) {
      notify('当前批次还在进行中，请等它结束或先停止后续下发', 'err')
      return
    }
    const unique = [...new Map(devicesToUpgrade.map((device) => [device.id, device])).values()]
    if (!unique.length) {
      notify('请先选择需要升级的设备', 'err')
      return
    }
    if (new Set(unique.map((device) => device.type)).size > 1) {
      notify('批量升级仅支持同一类型设备', 'err')
      return
    }
    const targets = unique.filter((device) => canUpgrade(device))
    if (!targets.length) {
      notify('所选设备当前都不可升级', 'err')
      return
    }
    const skipped = unique.length - targets.length
    if (skipped) notify(`已跳过 ${skipped} 台当前不可升级的设备`, 'err')
    pendingIsBatch.value = true
    pendingUpgrade.value = targets
  }

  function dismissUpgrade() {
    pendingUpgrade.value = []
  }

  // 本项目不连云平台：固件来自本地文件，版本号由上传时填写/从文件名解析。
  function confirmUpgrade(firmware: { name: string; fileName: string; version: string }) {
    const targets = pendingUpgrade.value
    pendingUpgrade.value = []
    if (!targets.length) return
    const version = /^\d/.test(firmware.version) ? `v${firmware.version}` : firmware.version
    uploadedFirmware.value = { ...firmware, version }
    // 只升级本次确认清单里的设备：不能再按「全量可升级设备」推导范围，否则会把没勾选的设备一起升上去。
    if (pendingIsBatch.value) enqueueUpgrades(targets, version)
    else if (targets[0]) launchUpgrade(targets[0], version)
  }

  return {
    devices,
    floors,
    rooms,
    deviceMeta,
    uploadedFirmware,
    otaFault,
    selectedFloor,
    selectedDevice,
    deviceTab,
    toastMessage,
    toastKind,
    onlineDevices,
    floorRooms,
    allLogs,
    alertLogs,
    deviceLogs,
    statusOf,
    statusText,
    notify,
    openDevice,
    openDeviceOta,
    togglePower,
    setDeviceParam,
    startUpgrade,
    enqueueUpgrades,
    otaBatch,
    batchDevices,
    batchStats,
    batchRunning,
    retryFailedInBatch,
    stopBatchQueue,
    retryUpgrade,
    otaBusy,
    otaStageText,
    upgradeKind,
    pendingUpgrade,
    canUpgrade,
    requestUpgrade,
    requestUpgradeMany,
    dismissUpgrade,
    confirmUpgrade,
  }
})
