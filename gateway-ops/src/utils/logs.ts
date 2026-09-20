import dayjs from 'dayjs'
import type { Device, DeviceLog } from '@/types/gateway'

// 日志时间统一以「YYYY-MM-DD HH:mm:ss」保存（对应网关上报的时间字段），
// 展示层再按场景切成片段：日期筛选取到天，表格里按需显示到秒。
export const LOG_DATE_FORMAT = 'YYYY-MM-DD'
export const LOG_AT_FORMAT = 'YYYY-MM-DD HH:mm:ss'
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

// 日期范围查询：起止日期都包含当天（按「天」闭区间），留空表示该侧不限制。
// 日期串是 YYYY-MM-DD，直接按字符串比较即等价于按时间先后比较。
export function logsInDateRange(logs: DeviceLog[], from?: string | null, to?: string | null) {
  return logs.filter((log) => {
    const date = logDate(log)
    if (!date) return false
    if (from && date < from) return false
    if (to && date > to) return false
    return true
  })
}
