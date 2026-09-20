<script setup lang="ts">
import { CalendarRange, History, X } from '@lucide/vue'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'
import type { Device, DeviceLog, LogSource } from '@/types/gateway'
import {
  LOG_DATE_FORMAT,
  logAtText,
  logDate,
  logSourceText,
  logSourcesOf,
  logsInDateRange,
  sortLogsDesc,
} from '@/utils/logs'

const props = defineProps<{ device: Device }>()
const emit = defineEmits<{ close: [] }>()

const today = dayjs()
// 默认查最近 7 天（含今天）：现场排障最常用的区间，打开弹窗就有数据。
const from = ref(today.subtract(6, 'day').format(LOG_DATE_FORMAT))
const to = ref(today.format(LOG_DATE_FORMAT))
// 动作来源筛选与日期筛选叠加生效；选项只取这台设备日志里出现过的来源。
const sourceFilter = ref<LogSource | 'all'>('all')

// 动作来源筛选项：按协议枚举顺序列出这台设备日志里出现过的来源，
// 弹窗一打开就有可选项，也不会出现「选了却查不到结果」的空选项。
const sourceOptions = computed(() => logSourcesOf(props.device.logs))

// 该设备日志覆盖的日期范围（最早 ~ 最新）。单台设备的历史里「不限」就等于这个范围，
// 所以两个起止框一律用它兜底：点「全部」或清除单侧后落回具体日期，不会露出浏览器
// 原生的 yyyy/mm/dd 空占位。设备没有日志时退回今天。
const fullRange = computed(() => {
  const history = sortLogsDesc(props.device.logs)
  const fallback = today.format(LOG_DATE_FORMAT)
  const boundary = (log: DeviceLog | undefined) => (log ? logDate(log) || fallback : fallback)
  return { from: boundary(history[history.length - 1]), to: boundary(history[0]) }
})

// 起止日期都是闭区间，改动即刷新结果，不需要再点一次「查询」。
// 处理函数直接收元素：清空后回落边界时若新值与上一次相同，Vue 不会重渲染，
// 得把真实值写回元素，否则输入框会停在空占位（浏览器原生的 yyyy/mm/dd）。
function setFrom(input: HTMLInputElement) {
  // 清空起点 = 放开起点，落回最早有记录的那天。
  from.value = input.value || fullRange.value.from
  // 起点晚于终点会把结果筛成空，直接顺着用户的选择把终点一并推后。
  if (to.value && to.value < from.value) to.value = from.value
  input.value = from.value
}

function setTo(input: HTMLInputElement) {
  // 清空终点 = 放开终点，落回最新有记录的那天。
  to.value = input.value || fullRange.value.to
  if (from.value && from.value > to.value) from.value = to.value
  input.value = to.value
}

function preset(days: number) {
  from.value = today.subtract(days - 1, 'day').format(LOG_DATE_FORMAT)
  to.value = today.format(LOG_DATE_FORMAT)
}

// 「全部」= 该设备记录的最早 ~ 最新：起止框始终是具体日期，摘要也照实显示区间。
function reset() {
  from.value = fullRange.value.from
  to.value = fullRange.value.to
}

// 该设备在这个区间、且命中当前动作来源的日志，最新的排在最前面。
const logs = computed(() =>
  sortLogsDesc(logsInDateRange(props.device.logs, from.value, to.value)).filter(
    (log) => sourceFilter.value === 'all' || log.source === sourceFilter.value,
  ),
)

// 设备全部日志覆盖的日期范围，空结果显示时用来提示「什么时候才有数据」。
const historyRange = computed(() =>
  props.device.logs.length ? `${fullRange.value.from} ~ ${fullRange.value.to}` : '',
)
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <section class="device-modal log-history-dialog" role="dialog" aria-modal="true">
      <header class="modal-header">
        <div class="device-icon large">
          <History :size="22" />
        </div>
        <div>
          <h2>{{ device.room }} · {{ device.name }} · 以往日志</h2>
          <p>
            ID {{ device.id }} · 共 {{ device.logs.length }} 条记录 · 按日期查询，起止当天都包含
          </p>
        </div>
        <button class="icon-button" title="关闭" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>

      <div class="modal-body">
        <div class="log-filter">
          <label class="date-field">
            <span>开始日期</span>
            <input
              :value="from"
              type="date"
              :max="to || undefined"
              @change="setFrom($event.target as HTMLInputElement)"
            />
          </label>
          <label class="date-field">
            <span>结束日期</span>
            <input
              :value="to"
              type="date"
              :min="from || undefined"
              @change="setTo($event.target as HTMLInputElement)"
            />
          </label>
          <label class="source-field">
            <span>动作来源</span>
            <select v-model="sourceFilter">
              <option value="all">全部来源</option>
              <option v-for="value in sourceOptions" :key="value" :value="value">
                {{ logSourceText(value) }}
              </option>
            </select>
          </label>
          <div class="range-presets">
            <button class="chip" @click="preset(1)">今天</button>
            <button class="chip" @click="preset(7)">近 7 天</button>
            <button class="chip" @click="preset(30)">近 30 天</button>
            <button class="chip" @click="reset">全部</button>
          </div>
        </div>

        <div class="log-history-summary">
          <CalendarRange :size="14" />
          <span v-if="from === fullRange.from && to === fullRange.to"
            >全部时间范围（{{ from }} ~ {{ to }}）共 {{ logs.length }} 条</span
          >
          <span v-else>{{ from }} ~ {{ to }} 共 {{ logs.length }} 条</span>
        </div>

        <div class="log-history-table">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>级别</th>
                <th>动作来源</th>
                <th>描述</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in logs" :key="`${log.at}-${log.message}`">
                <td class="mono">{{ logAtText(log) }}</td>
                <td>
                  <b class="level" :class="log.level">{{ log.level }}</b>
                </td>
                <td>{{ logSourceText(log.source) }}</td>
                <td>{{ log.message }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!logs.length" class="log-history-empty">
            所选日期范围内没有日志记录<span v-if="sourceFilter !== 'all'"
              >（当前动作来源下没有记录）</span
            ><span v-if="historyRange">；该设备现有记录：{{ historyRange }}</span>
          </p>
        </div>
      </div>

      <footer class="confirm-footer">
        <button class="ghost-button" @click="emit('close')">关闭</button>
      </footer>
    </section>
  </div>
</template>
