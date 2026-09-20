<script setup lang="ts">
import { CircleAlert, ListChecks, SquareX, X } from '@lucide/vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useGatewayStore } from '@/stores/gateway'
import type { Device, OtaStatus } from '@/types/gateway'
import OtaStatusLine from '@/components/devices/OtaStatusLine.vue'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ 'next-batch': [] }>()

const store = useGatewayStore()
const filter = ref<'all' | 'running' | 'queued' | 'failed' | 'success' | 'stopped'>('all')
// 「进入下一批升级」的人为确认：上一批还有设备没升上去时先弹一层，别让人顺手划过去。
const confirmingNext = ref(false)
const retryFirstButton = ref<HTMLButtonElement | null>(null)

const batch = computed(() => store.otaBatch)
const stats = computed(() => store.batchStats)
// 没升上去的设备：失败（校验 / 写入 / 超时 / 离线）和被停止下发的一起算，都得有人管。
const unfinished = computed(() => stats.value.failed + stats.value.stopped)
// 确认框里只报真正存在的那一类，不写"停止下发 0 台"这种废话。
const unfinishedText = computed(() => {
  const parts: string[] = []
  if (stats.value.failed) parts.push(`失败 ${stats.value.failed} 台`)
  if (stats.value.stopped) parts.push(`停止下发 ${stats.value.stopped} 台`)
  return parts.join(' · ')
})
const typeLabels = computed(() => [
  ...new Set(store.batchDevices.map((device) => store.deviceMeta[device.type].label)),
])
// 整体进度 = 已结束的台数 + 在飞设备折算的进度。只按台数算的话，
// 批次刚开始时进度条会一直贴 0，看不出在动。
const progressPercent = computed(() => {
  const total = stats.value.total
  if (!total) return 0
  const inFlight = store.batchDevices
    .filter((device) => store.otaBusy(device))
    .reduce((sum, device) => sum + device.progress / 100, 0)
  return Math.min(100, Math.round(((stats.value.settled + inFlight) / total) * 100))
})

const tabs = computed(() => [
  { key: 'all' as const, label: '全部', count: stats.value.total },
  {
    key: 'running' as const,
    label: '进行中',
    count: stats.value.running,
  },
  { key: 'queued' as const, label: '等待中', count: stats.value.queued },
  { key: 'failed' as const, label: '失败', count: stats.value.failed },
  { key: 'success' as const, label: '成功', count: stats.value.success },
  { key: 'stopped' as const, label: '已停止', count: stats.value.stopped },
])

const matched = (device: Device) => {
  if (filter.value === 'all') return true
  if (filter.value === 'running') return store.otaBusy(device)
  return device.otaStatus === (filter.value as OtaStatus)
}
const visibleDevices = computed(() => store.batchDevices.filter(matched))

// 批次还在下发时不能开下一批（会同时存在两个固件包上下文），按钮置灰。
function requestNextBatch() {
  if (store.batchRunning) return
  if (unfinished.value) {
    confirmingNext.value = true
    return
  }
  goNextBatch()
}

function goNextBatch() {
  confirmingNext.value = false
  emit('next-batch')
}

// 关掉面板时把确认层一起收掉，免得下次打开还挂着上一次的判断。
watch(open, (isOpen) => {
  if (!isOpen) confirmingNext.value = false
})

// 默认焦点落在「先去重试」：漏升设备的代价比多点一次大。
watch(confirmingNext, async (show) => {
  if (!show) return
  await nextTick()
  retryFirstButton.value?.focus()
})
</script>

<template>
  <div v-if="open && batch" class="modal-backdrop batch-backdrop" @click.self="open = false">
    <section class="batch-dialog">
      <header class="modal-header">
        <div class="device-icon large"><ListChecks :size="22" /></div>
        <div>
          <h2>批量升级 · {{ typeLabels.join('、') }}</h2>
          <p>
            目标版本 {{ batch.targetVersion }} · {{ batch.firmwareName }} · 开始于
            {{ batch.startedAt }}
          </p>
        </div>
        <button class="icon-button" title="关闭" @click="open = false"><X :size="20" /></button>
      </header>

      <div class="batch-summary">
        <div class="batch-counts">
          <span
            >已提交 <b>{{ stats.total }}</b> 台</span
          >
          <span class="success-text"
            >成功 <b>{{ stats.success }}</b></span
          >
          <span class="danger-text"
            >失败 <b>{{ stats.failed }}</b></span
          >
          <span
            >进行中 <b>{{ stats.running }}</b></span
          >
          <span
            >等待 <b>{{ stats.queued }}</b></span
          >
          <!-- 汇总项固定显示，避免数字变化时布局跳动。 -->
          <span
            >已停止 <b>{{ stats.stopped }}</b></span
          >
        </div>
        <div class="progress-wrap">
          <i :style="{ width: `${progressPercent}%` }"></i>
        </div>
        <small class="batch-note">
          {{ progressPercent }}% ·
          {{
            stats.finished
              ? '本批次已结束，结果保留在设备行的状态与日志里'
              : '关闭本面板不会中断升级，升级会继续在后台进行'
          }}
        </small>
      </div>

      <div class="tabs batch-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="{ active: filter === tab.key }"
          @click="filter = tab.key"
        >
          {{ tab.label }} {{ tab.count }}
        </button>
      </div>

      <div class="batch-list">
        <div v-for="device in visibleDevices" :key="device.id" class="batch-row">
          <div class="device-icon">
            <component :is="store.deviceMeta[device.type].icon" :size="18" />
          </div>
          <div class="batch-row-info">
            <strong>{{ device.room }} · {{ device.name }}</strong>
            <OtaStatusLine :device="device" />
          </div>
        </div>
        <p v-if="!visibleDevices.length" class="batch-empty">该状态下没有设备</p>
      </div>

      <footer class="confirm-footer">
        <button class="ghost-button" :disabled="!stats.failed" @click="store.retryFailedInBatch()">
          重试失败的 {{ stats.failed }} 台
        </button>
        <button class="ghost-button" :disabled="!stats.queued" @click="store.stopBatchQueue()">
          <SquareX :size="15" />停止后续下发
        </button>
        <button class="ghost-button" @click="open = false">关闭</button>
        <!-- 批次结束后这里就是"下一批"的入口；批次还在跑时置灰。 -->
        <button
          class="primary-button"
          :disabled="store.batchRunning"
          :title="
            store.batchRunning
              ? '本批次还在下发中，等它结束或先停止后续下发'
              : '收起面板，重新挑设备并上传固件'
          "
          @click="requestNextBatch"
        >
          进入下一批升级
        </button>
      </footer>
    </section>
  </div>

  <!-- 还有失败 / 未下发设备时，"进入下一批"必须先过一道人为确认。
       这层单独做根节点：面板遮罩带 backdrop-filter，会把 position: fixed 的后代
       当成自己的包含块，嵌在里面既会被面板的滚动条带偏，也会和面板挤在同一层。 -->
  <div
    v-if="open && batch && confirmingNext"
    class="modal-backdrop batch-confirm-backdrop"
    @click.self="confirmingNext = false"
  >
    <section class="confirm-dialog">
      <header class="modal-header">
        <div class="device-icon large"><CircleAlert :size="22" /></div>
        <div>
          <h2>上一批还有设备没升上去</h2>
          <p>{{ unfinishedText }}</p>
        </div>
      </header>
      <div class="confirm-body">
        <p class="firmware-summary">
          这些设备不会自动带进下一批；它们的状态、日志和重试入口都留在升级列表里。
        </p>
      </div>
      <footer class="confirm-footer">
        <button ref="retryFirstButton" class="primary-button" @click="confirmingNext = false">
          先去重试
        </button>
        <button class="ghost-button" @click="goNextBatch">仍要进入下一批</button>
      </footer>
    </section>
  </div>
</template>
