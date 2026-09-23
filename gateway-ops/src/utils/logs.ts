import dayjs from 'dayjs'
import type { Device, DeviceLog, LogSource } from '@/types/gateway'

// 日志时间统一以「YYYY-MM-DD HH:mm:ss」保存（对应网关上报的时间字段），
// 展示层再按场景切成片段：筛选精确到分钟，表格里按需显示到秒。
export const LOG_DATE_FORMAT = 'YYYY-MM-DD'
export const LOG_AT_FORMAT = 'YYYY-MM-DD HH:mm:ss'
export const LOG_MINUTE_FORMAT = 'YYYY-MM-DDTHH:mm'
export const LOG_MINUTE_TEXT_FORMAT = 'YYYY-MM-DD HH:mm'
// 历史日志的时间列展示格式（与改造前的「09-15 15:49:44」保持一致）。
export const LOG_DISPLAY_FORMAT = 'MM-DD HH:mm:ss'

export function nowLogAt() {
  return dayjs().format(LOG_AT_FORMAT)
}

// dayjs 对「空格分隔」的时间串解析不稳定，统一换成 ISO 的 T 再解析。
export function parseLogAt(log: DeviceLog) {
  // at 缺失时退回到展示用的 time，老数据也不会直接报错。
  const source = (log.at || log.time || '').replace(' ', 'T')
  const parsed = dayjs(source)
  return parsed.isValid() ? parsed : null
}

export function logTimestamp(log: DeviceLog) {
  return parseLogAt(log)?.valueOf() ?? 0
}

// 日志归属的日期（YYYY-MM-DD）；解析不出来时返回空串，这类记录不进日期查询结果。
export function logDate(log: DeviceLog) {
  return parseLogAt(log)?.format(LOG_DATE_FORMAT) ?? ''
}

// 用于 datetime-local 输入框的分钟边界值；解析不出来时返回空串。
export function logMinute(log: DeviceLog) {
  return parseLogAt(log)?.startOf('minute').format(LOG_MINUTE_FORMAT) ?? ''
}

// 完整时间戳，用于日志弹窗：即使列表里显示「刚刚」，这里也要给出可核对的时间。
export function logAtText(log: DeviceLog) {
  return parseLogAt(log)?.format(LOG_AT_FORMAT) ?? log.time
}

export function sortLogsDesc(logs: DeviceLog[]) {
  return [...logs].sort((left, right) => logTimestamp(right) - logTimestamp(left))
}

// 日志中心每台设备只显示一条：取该设备时间最新的日志。
export function latestLogOf(device: Device) {
  return device.logs.reduce<DeviceLog | null>(
    (latest, log) => (!latest || logTimestamp(log) > logTimestamp(latest) ? log : latest),
    null,
  )
}

// 时间范围查询：起止分钟都包含在内（按「分钟」闭区间），留空表示该侧不限制。
// 范围值是 datetime-local 格式，直接按字符串比较即可按时间先后排序。
export function logsInDateRange(logs: DeviceLog[], from?: string | null, to?: string | null) {
  return logs.filter((log) => {
    const minute = logMinute(log)
    if (!minute) return false
    if (from && minute < from) return false
    if (to && minute > to) return false
    return true
  })
}

// 动作来源（网关协议里的「动作来源」枚举）：值 → 文案。日志中心的动作来源列与筛选框
// 都读这张表；界面上只显示名称，协议文档里括号内的补充说明（例如「扩展为客人按键操作」）
// 不进界面。协议以后新增取值时补在这里，老日志也能正常显示。
const LOG_SOURCE_LABEL_ENTRIES: [LogSource, string][] = [
  [-1, '未知'],
  [0, 'H5'],
  [1, '微信小程序'],
  [2, '百度音箱'],
  [3, '华住会APP'],
  [4, '华住音箱'],
  [5, '供应商APP'],
  [6, '客房内按键开关'],
  [7, '设备维度传感器采样'],
  [8, '遥控器控制'],
  [9, '硬件终端线下操作'],
  [10, '硬件终端线上后台'],
  [11, '华住IOT平台'],
  [12, '供应商音箱'],
  [16, '客控系统本地联动操作'],
  [17, '客房维度传感器采样'],
  [20, '小米音箱'],
  [21, '潘多拉音箱'],
  [22, '梯控'],
  [99, '客房心跳数据'],
]

export const LOG_SOURCE_LABEL = Object.fromEntries(LOG_SOURCE_LABEL_ENTRIES) as Record<
  LogSource,
  string
>

// 动作来源的展示文案；取值还没收进上表时退回「未知」，单元格不会留空。
export function logSourceText(source: LogSource) {
  return LOG_SOURCE_LABEL[source] ?? LOG_SOURCE_LABEL[-1]
}

// 一组日志里实际出现过的动作来源，顺序与协议枚举一致。日志页与以往日志弹窗的筛选框
// 选项都由它生成：不会出现「选了却查不到结果」的空选项，协议新增取值后只要数据里
// 出现过，就会自动出现在筛选框里。
export function logSourcesOf(logs: DeviceLog[]): LogSource[] {
  const present = new Set(logs.map((log) => log.source))
  return LOG_SOURCE_LABEL_ENTRIES.filter(([value]) => present.has(value)).map(([value]) => value)
}
