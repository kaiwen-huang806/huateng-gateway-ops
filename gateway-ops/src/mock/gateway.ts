import dayjs from 'dayjs'
import {
  AirVent,
  Coffee,
  CreditCard,
  Lightbulb,
  LockKeyhole,
  MoonStar,
  PlugZap,
  Power,
  Radar,
  Radio,
  ScanFace,
  Snowflake,
  SlidersHorizontal,
  ThermometerSun,
  ToggleLeft,
  Tv,
  Wind,
} from '@lucide/vue'
import type {
  Device,
  DeviceLog,
  DeviceMeta,
  DeviceType,
  LogLevel,
  LogSource,
  Room,
  RoomStatus,
} from '@/types/gateway'
import { LOG_AT_FORMAT, LOG_DISPLAY_FORMAT, sortLogsDesc } from '@/utils/logs'

export const floors = ['3F', '5F', '8F', '10F', '12F']

export const deviceMeta: Record<DeviceType, DeviceMeta> = {
  lock: { label: '门锁', icon: LockKeyhole },
  'card-power': { label: '插卡取电', icon: CreditCard },
  'switch-1k': { label: '1k 开关', icon: ToggleLeft },
  'switch-2k': { label: '2k 开关', icon: ToggleLeft },
  'switch-3k': { label: '3k 开关', icon: ToggleLeft },
  'switch-4k': { label: '4k 开关', icon: ToggleLeft },
  'switch-6k': { label: '6k 开关', icon: ToggleLeft },
  thermostat: { label: '温控器', icon: ThermometerSun },
  'remote-ac': { label: '空调万能遥控器', icon: Radio },
  'remote-tv': { label: '电视万能遥控器', icon: Tv },
  curtain: { label: '窗帘电机', icon: AirVent },
  'sheer-curtain': { label: '窗纱电机', icon: Wind },
  'smart-socket': { label: '智能插座', icon: PlugZap },
  pir: { label: '人体红外传感器', icon: ScanFace },
  presence: { label: '人体存在传感器', icon: Radar },
  relay: { label: '单路通断器', icon: Power },
  'dimmer-2way': { label: '2 路调光模块', icon: SlidersHorizontal },
  'dimmer-4way': { label: '4 路调光模块', icon: SlidersHorizontal },
  'dimmer-mirror': { label: '镜灯调光模块', icon: Lightbulb },
  kettle: { label: '烧水壶', icon: Coffee },
  hairdryer: { label: '电吹风', icon: Wind },
  'light-driver': { label: '灯光驱动', icon: Radio },
}

// 每间客房的设备清单：这个顺序同时也是房间卡片、OTA 列表和日志表的展示顺序。
const ROOM_DEVICE_TYPES: DeviceType[] = [
  'lock',
  'card-power',
  'switch-1k',
  'switch-2k',
  'switch-3k',
  'switch-4k',
  'switch-6k',
  'thermostat',
  'remote-ac',
  'remote-tv',
  'curtain',
  'sheer-curtain',
  'smart-socket',
  'pir',
  'presence',
  'relay',
  'dimmer-2way',
  'dimmer-4way',
  'dimmer-mirror',
  'kettle',
  'hairdryer',
  'light-driver',
]

const deviceNames: Record<DeviceType, string> = {
  lock: '门锁',
  'card-power': '插卡取电',
  'switch-1k': '1k 开关',
  'switch-2k': '2k 开关',
  'switch-3k': '3k 开关',
  'switch-4k': '4k 开关',
  'switch-6k': '6k 开关',
  thermostat: '温控器',
  'remote-ac': '空调遥控器',
  'remote-tv': '电视遥控器',
  curtain: '窗帘电机',
  'sheer-curtain': '窗纱电机',
  'smart-socket': '智能插座',
  pir: '人体红外传感器',
  presence: '人体存在传感器',
  relay: '单路通断器',
  'dimmer-2way': '2 路调光模块',
  'dimmer-4way': '4 路调光模块',
  'dimmer-mirror': '镜灯调光模块',
  kettle: '烧水壶',
  hairdryer: '电吹风',
  'light-driver': '灯光驱动',
}

// 各类型设备的可下发参数。电源类设备的通电状态跟着在线状态走，模拟"设备在线即在工作"。
const deviceParams = (type: DeviceType, online: boolean): Device['params'] => {
  switch (type) {
    case 'lock':
      return { locked: true }
    case 'card-power':
      return { inserted: online }
    case 'switch-1k':
    case 'switch-2k':
    case 'switch-3k':
    case 'switch-4k':
    case 'switch-6k':
      return { power: online }
    case 'thermostat':
      return { mode: '制冷', temperature: 24, fan: '自动', locked: false }
    case 'remote-ac':
      return { power: online, mode: '制冷', temperature: 24, fan: '自动' }
    case 'remote-tv':
      return { power: online, volume: 20, source: 'HDMI 1' }
    case 'curtain':
    case 'sheer-curtain':
      return { open: 65 }
    case 'smart-socket':
      return { power: online, current: 1.8 }
    case 'pir':
      return { detected: online, sensitivity: 75 }
    case 'presence':
      return { present: online, confidence: 92 }
    case 'relay':
      return { power: online }
    case 'dimmer-2way':
      return { power: online, brightness: 78 }
    case 'dimmer-4way':
      return { power: online, brightness: 72 }
    case 'dimmer-mirror':
      return { power: online, brightness: 60 }
    case 'kettle':
      return { power: online, temperature: 85, keepWarm: true }
    case 'hairdryer':
      return { power: online, level: 2 }
    case 'light-driver':
      return { power: online, brightness: 78 }
  }
}

const roomGroups = [
  ['3F', '标准客房', ['301', '302', '303', '304', '305', '306', '307', '308']],
  ['5F', '商务客房', ['501', '502', '503', '504', '505', '506', '507', '508']],
  ['8F', '行政客房', ['801', '802', '803', '804', '805', '806']],
  ['10F', '豪华套房', ['1001', '1002', '1003', '1004']],
  ['12F', '总统套房', ['1201', '1202']],
] as const

const ROOM_STATUSES: RoomStatus[] = [
  'occupied',
  'cleaning',
  'do-not-disturb',
  'vacant',
  'unoccupied',
  'fault',
]

export const rooms: Room[] = roomGroups.flatMap(([floor, category, ids]) =>
  ids.map((id, index) => {
    const roomIndex =
      roomGroups
        .slice(
          0,
          roomGroups.findIndex(([groupFloor]) => groupFloor === floor),
        )
        .reduce((total, [, , roomIds]) => total + roomIds.length, 0) + index

    return {
      id,
      floor,
      category,
      gatewayOnline: roomIndex % 6 !== 0,
      status: ROOM_STATUSES[roomIndex % ROOM_STATUSES.length]!,
      devices: ROOM_DEVICE_TYPES.map((type) => `${id}-${type}`),
    }
  }),
)

export const createDevices = (): Device[] =>
  rooms.flatMap((room, roomIndex) =>
    room.devices.map((id, index) => {
      const type = ROOM_DEVICE_TYPES[index]!
      const online = (roomIndex + index) % 5 !== 0
      return {
        id,
        room: room.id,
        floor: room.floor,
        name: deviceNames[type],
        type,
        online,
        firmware: type === 'light-driver' ? 'v2.3.0' : 'v2.4.0',
        progress: 0,
        otaStatus: 'idle',
        otaTarget: null,
        otaBatchId: null,
        otaError: null,
        otaAttempts: 0,
        otaUpdatedAt: null,
        params: deviceParams(type, online),
        logs: createLogs(roomIndex * ROOM_DEVICE_TYPES.length + index),
      }
    }),
  )

// 运行日志：真实环境里由网关按设备上报，这里为每台设备生成一份多日记录，
// 供日志中心的「查看以往日志」按日期查询。基准日期取运行当天倒推几天，
// 这样任何时候打开演示都能在默认区间里查到数据。
// 天数比默认的「近 7 天」多一点：点「全部」时条数会明显变多，日期区间与动作来源
// 两个筛选叠加起来的效果才看得出来。
const LOG_HISTORY_DAYS = 10

// 日志模板：每条都带上动作来源（网关协议里的来源枚举），内容与该来源对得上 —— 客人在
// App 上操作、房间里的按键、设备侧采样、内嵌屏本地操作、平台下发、音箱语音、本地联动
// 各写几条，日志中心的动作来源列与筛选框才有可对照的样本：每类来源都能筛出若干行，
// 级别也不一样（INFO 为主，采样与联动有 WARN，按键与音箱留了失败记录）。
const LOG_TEMPLATES: { level: LogLevel; source: LogSource; message: string }[] = [
  // 3 华住会APP：客人在手机上操作
  { level: 'INFO', source: 3, message: 'App 下发开灯指令，响应成功（42ms）' },
  { level: 'INFO', source: 3, message: 'App 设置空调 24℃，参数已同步' },
  { level: 'WARN', source: 3, message: 'App 指令响应超时（1.2s），网关重试后成功' },
  // 6 客房内按键开关：客人在房间里按开关
  { level: 'INFO', source: 6, message: '床头按键开关触发：开灯（多路开关 1 路）' },
  { level: 'INFO', source: 6, message: '面板按键关闭窗帘，执行成功' },
  { level: 'ERROR', source: 6, message: '按键指令下发失败：开关无响应（校验错误）' },
  // 7 设备维度传感器采样
  { level: 'INFO', source: 7, message: '温度采样上报：24.6℃（温感探头）' },
  { level: 'INFO', source: 7, message: '门磁采样：门已关闭' },
  { level: 'WARN', source: 7, message: '人体存在采样异常：红外与毫米波读数不一致' },
  // 9 硬件终端线下操作：设备内嵌屏上直接操作
  { level: 'INFO', source: 9, message: '内嵌屏本地操作：空调调至 24℃' },
  { level: 'INFO', source: 9, message: '内嵌屏切换场景：阅读模式' },
  { level: 'WARN', source: 9, message: '内嵌屏离线缓存指令，恢复联网后补发成功' },
  // 11 华住IOT平台：平台侧下发（运维台的控制与 OTA 也记在这个来源下）
  { level: 'INFO', source: 11, message: '平台下发参数同步，设备已确认' },
  { level: 'INFO', source: 11, message: '平台定时任务触发：夜间巡检完成' },
  { level: 'WARN', source: 11, message: '平台心跳超时，设备已自动重连' },
  // 12 供应商音箱：客房音箱的语音指令
  { level: 'INFO', source: 12, message: '语音指令下发成功：打开夜灯' },
  { level: 'INFO', source: 12, message: '语音指令下发成功：音量调整为 20' },
  { level: 'ERROR', source: 12, message: '语音指令未识别，下发失败' },
  // 16 客控系统本地联动操作
  { level: 'INFO', source: 16, message: '本地联动触发：开门自动开灯' },
  { level: 'INFO', source: 16, message: '本地联动触发：离人自动断电' },
  { level: 'WARN', source: 16, message: '本地联动执行延迟 800ms，已补偿成功' },
]

// 补错误记录时从这些模板里挑一条：级别、文案、动作来源三处一起改，避免出现「来源是
// 传感器、文案却是按键失败」这种对不上的日志；随机挑也免得兜底错误全挤在同一个来源上。
const LOG_ERROR_TEMPLATES = LOG_TEMPLATES.filter((template) => template.level === 'ERROR')

// 线性同余：同一台设备每次生成的日志完全一致，测试与截图都可复现。
function seededRandom(seed: number) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function createLogs(seed: number): DeviceLog[] {
  const random = seededRandom(seed + 7)
  const today = dayjs().startOf('day')
  const logs: DeviceLog[] = []
  for (let day = 0; day < LOG_HISTORY_DAYS; day += 1) {
    // 每天 3~5 条，时间落在 08:00~22:00 之间；一天多几条，单台设备的历史里各类
    // 动作来源与级别才铺得开，筛来源时能看出前后差别。
    const perDay = 3 + Math.floor(random() * 3)
    for (let entry = 0; entry < perDay; entry += 1) {
      const template = LOG_TEMPLATES[Math.floor(random() * LOG_TEMPLATES.length)]!
      const at = today
        .subtract(day, 'day')
        .add(8 + Math.floor(random() * 14), 'hour')
        .add(Math.floor(random() * 60), 'minute')
        .add(Math.floor(random() * 60), 'second')
      logs.push({
        at: at.format(LOG_AT_FORMAT),
        time: at.format(LOG_DISPLAY_FORMAT),
        level: template.level,
        source: template.source,
        message: template.message,
      })
    }
  }
  // 设备健康度是按「日志里有没有 ERROR」判定的，保证每台设备至少留一条错误记录，
  // 否则改造后全量设备会从「注意」变成「正常」，等于顺手改了概览页的口径。
  if (!logs.some((log) => log.level === 'ERROR')) {
    const target = logs[1] ?? logs[0]
    const template = LOG_ERROR_TEMPLATES[Math.floor(random() * LOG_ERROR_TEMPLATES.length)]
    if (target && template) {
      target.level = template.level
      target.message = template.message
      target.source = template.source
    }
  }
  return sortLogsDesc(logs)
}
