import type { Component } from 'vue'

export type ViewKey = 'overview' | 'rooms' | 'ota' | 'logs' | 'accounts' | 'settings'
export type AccountPermission = 'after-sales' | 'research' | 'engineering' | 'management'
export type AccountStatus = 'enabled' | 'disabled'

export interface Account {
  id: string
  name: string
  password: string
  hotelCode: string
  permission: AccountPermission
  status: AccountStatus
  createdAt: string
}
// 客房设备类型：按酒店客房实际部署拆分，每个型号/用途都可以独立筛选、控制和升级。
export type DeviceType =
  | 'lock'
  | 'card-power'
  | 'switch-1k'
  | 'switch-2k'
  | 'switch-3k'
  | 'switch-4k'
  | 'switch-6k'
  | 'thermostat'
  | 'remote-ac'
  | 'remote-tv'
  | 'curtain'
  | 'sheer-curtain'
  | 'smart-socket'
  | 'pir'
  | 'presence'
  | 'relay'
  | 'dimmer-2way'
  | 'dimmer-4way'
  | 'dimmer-mirror'
  | 'kettle'
  | 'hairdryer'
  | 'light-driver'
export type DeviceStatus = 'ok' | 'warn' | 'err'
export type LogLevel = 'INFO' | 'WARN' | 'ERROR'
// 动作来源：这条日志由谁触发（客人按键 / 传感器采样 / 平台下发 / 本地联动 …）。
// 取值与网关协议的动作来源枚举一致，值 → 文案的映射与展示顺序见 utils/logs.ts。
export type LogSource =
  -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 16 | 17 | 20 | 21 | 22 | 99
// 目标固件相对设备当前固件的动作：升级 / 同版本重刷 / 降级。
export type UpgradeKind = 'upgrade' | 'reflash' | 'downgrade'
// OTA 任务状态：待机 / 排队等槽位 / 传输固件 / 写入固件 / 成功 / 失败 / 被停止下发。
export type OtaStatus =
  'idle' | 'queued' | 'transferring' | 'installing' | 'success' | 'failed' | 'stopped'
// offline 只由前端在"排队期间设备掉线"时判定，不属于可注入的故障。
export type OtaFailureCode = 'checksum' | 'write' | 'timeout' | 'offline'
// 故障注入取值，仅用于开发演示：决定下一次下发升级的结果；真实环境由网关判定。
// batch-partial 表示"批次内每 5 台失败 3 台"，用来演示部分失败。
export type OtaFault = 'none' | 'batch-partial' | 'checksum' | 'write' | 'timeout'

// 一次批量升级。前端先派生 id 占位，字段形状按网关将来会返回的结构设计，
// 对接时只需把数据来源换成网关返回的批次/任务对象。
export interface OtaBatch {
  id: string
  targetVersion: string
  firmwareName: string
  startedAt: string
  deviceIds: string[]
}

export interface OtaBatchStats {
  total: number
  queued: number
  running: number
  success: number
  failed: number
  stopped: number
  settled: number
  finished: boolean
}

export interface OtaError {
  code: OtaFailureCode
  message: string
  at: string
}

export interface DeviceLog {
  // 机器可读时间戳（YYYY-MM-DD HH:mm:ss）：排序与按日期查询都以它为准。
  at: string
  // 展示用时间：刚产生的日志显示「刚刚」，历史日志显示 MM-DD HH:mm:ss。
  time: string
  level: LogLevel
  // 动作来源：产生这条日志的一方（客人操作 / 传感器 / 平台控制台 …）。
  source: LogSource
  message: string
}

// 日志中心的一行：每台设备只取最新一条日志，历史记录走弹窗按日期查。
export interface DeviceLogRow {
  device: Device
  log: DeviceLog
}

// 房间经营状态由酒店系统/网关上报，概览页只负责展示。
export type RoomStatus =
  'occupied' | 'cleaning' | 'do-not-disturb' | 'vacant' | 'unoccupied' | 'fault'

export interface Device {
  id: string
  room: string
  floor: string
  name: string
  type: DeviceType
  online: boolean
  firmware: string
  progress: number
  otaStatus: OtaStatus
  // 本次（或最近一次）升级的目标版本，失败重试时复用它。
  otaTarget: string | null
  // 归属的批量升级；单台升级为 null。批量面板按它聚合设备。
  otaBatchId: string | null
  otaError: OtaError | null
  otaAttempts: number
  otaUpdatedAt: string | null
  params: Record<string, string | number | boolean | undefined>
  logs: DeviceLog[]
}

export interface Room {
  id: string
  floor: string
  category: string
  gatewayOnline: boolean
  status: RoomStatus
  devices: string[]
}

export interface DeviceMeta {
  label: string
  icon: Component
}
