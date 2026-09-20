import dayjs from 'dayjs'
import {
  AirVent,
  Coffee,
  Lightbulb,
  LockKeyhole,
  MoonStar,
  Snowflake,
  ThermometerSun,
  Tv,
} from '@lucide/vue'
import type {
  Device,
  DeviceLog,
  DeviceMeta,
  DeviceType,
  LogLevel,
  LogSource,
  Room,
} from '@/types/gateway'
import { LOG_AT_FORMAT, LOG_DISPLAY_FORMAT, sortLogsDesc } from '@/utils/logs'

export const floors = ['3F', '5F', '8F', '10F', '12F']

export const deviceMeta: Record<DeviceType, DeviceMeta> = {
  light: { label: '智能灯具', icon: Lightbulb },
  ac: { label: '中央空调', icon: Snowflake },
  curtain: { label: '电动窗帘', icon: AirVent },
  lock: { label: '智能门锁', icon: LockKeyhole },
  nightlight: { label: '夜灯', icon: MoonStar },
  kettle: { label: '热水壶', icon: Coffee },
  tv: { label: '电视', icon: Tv },
  thermostat: { label: '温控面板', icon: ThermometerSun },
}

// 每间客房的设备清单：这个顺序同时也是房间卡片、OTA 列表和日志表的展示顺序，
// 前四种是原有基础设备，新增的四种追加在后面（不改动已有设备的 id 与顺序）。
const ROOM_DEVICE_TYPES: DeviceType[] = [
  'light',
  'ac',
  'curtain',
  'lock',
  'nightlight',
  'kettle',
  'tv',
  'thermostat',
]

const deviceNames: Record<DeviceType, string> = {
  light: '主灯',
  ac: '空调',
  curtain: '窗帘',
  lock: '门锁',
  nightlight: '夜灯',
  kettle: '热水壶',
  tv: '电视',
  thermostat: '温控面板',
}

// 各类型设备的可下发参数。电源类设备的通电状态跟着在线状态走，模拟"设备在线即在工作"。
const deviceParams = (type: DeviceType, online: boolean): Device['params'] => {
  switch (type) {
    case 'light':
      return { power: online, brightness: 78, colorTemp: 4200 }
    case 'ac':
      return { power: online, mode: '制冷', temperature: 24, fan: '自动' }
    case 'curtain':
      return { open: 65 }
    case 'lock':
      return { locked: true }
    case 'nightlight':
      return { power: online, brightness: 20, colorTemp: 2700, delay: 5 }
    case 'kettle':
      return { power: online, temperature: 85, keepWarm: true }
    case 'tv':
      return { power: online, volume: 20, source: 'HDMI 1' }
    case 'thermostat':
      return { mode: '制冷', temperature: 24, fan: '自动', locked: false }
  }
}

const roomGroups = [
  ['3F', '标准客房', ['301', '302', '303', '304', '305', '306', '307', '308']],
  ['5F', '商务客房', ['501', '502', '503', '504', '505', '506', '507', '508']],
  ['8F', '行政客房', ['801', '802', '803', '804', '805', '806']],
  ['10F', '豪华套房', ['1001', '1002', '1003', '1004']],
  ['12F', '总统套房', ['1201', '1202']],
] as const

export const rooms: Room[] = roomGroups.flatMap(([floor, category, ids]) =>
  ids.map((id) => ({
    id,
    floor,
    category,
    devices: ROOM_DEVICE_TYPES.map((type) => `${id}-${type}`),
  })),
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
        firmware: type === 'light' ? 'v2.3.0' : 'v2.4.0',
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
const LOG_HISTORY_DAYS = 6

// 日志模板：每条都带上动作来源（网关协议里的来源枚举），文案与来源相互对得上，
// 例如客人按键下发的指令就记在「客房内按键开关」下。这里覆盖了客人操作、设备侧采样、
// 平台下发与本地联动等来源，日志中心的动作来源筛选才有可对照的样本。
const LOG_TEMPLATES: { level: LogLevel; source: LogSource; message: string }[] = [
  { level: 'INFO', source: 3, message: '指令执行成功（响应 42ms）' },
  { level: 'INFO', source: 16, message: '定时场景触发：回房模式' },
  { level: 'WARN', source: 7, message: '信号强度偏低（RSSI < -75）' },
  { level: 'INFO', source: 11, message: '参数同步完成' },
  { level: 'ERROR', source: 6, message: '指令执行失败（校验错误）' },
  { level: 'WARN', source: 16, message: '离线后自动重连成功（中断 12s）' },
  { level: 'INFO', source: 16, message: '设备上线，注册到网关成功' },
  { level: 'INFO', source: 7, message: '能耗上报：本时段 0.4kWh' },
  { level: 'INFO', source: 12, message: '语音指令下发成功（音量 20）' },
  { level: 'WARN', source: 9, message: '面板本地操作：温度 24℃' },
]

// 补错误记录时复用的模板：级别、文案、动作来源三处一起改，避免出现「来源是传感器、
// 文案却是按键失败」这种对不上的日志。
const LOG_ERROR_TEMPLATE = LOG_TEMPLATES.find((template) => template.level === 'ERROR')!

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
    // 每天 2~4 条，时间落在 08:00~22:00 之间。
    const perDay = 2 + Math.floor(random() * 3)
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
    if (target) {
      target.level = LOG_ERROR_TEMPLATE.level
      target.message = LOG_ERROR_TEMPLATE.message
      target.source = LOG_ERROR_TEMPLATE.source
    }
  }
  return sortLogsDesc(logs)
}
