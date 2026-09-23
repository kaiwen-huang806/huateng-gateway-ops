<script setup lang="ts">
import { CircleAlert, ListChecks, Upload, Zap } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useGatewayStore } from '@/stores/gateway'
import type { Device, DeviceType } from '@/types/gateway'
import SectionHeading from '@/components/common/SectionHeading.vue'
import OtaStatusLine from '@/components/devices/OtaStatusLine.vue'
import OtaBatchDialog from '@/components/devices/OtaBatchDialog.vue'

const store = useGatewayStore()
// 故障注入控件只在开发环境出现（生产构建会被静态消除），用于演示升级失败。
const isDev = import.meta.env.DEV
const filter = ref<'all' | 'online' | 'offline'>('all')
const typeFilter = ref<DeviceType | 'all'>('all')
const roomSearch = ref('')
// 批次面板的开关：关掉只是收起监视面板，升级照常在后台跑。
const batchPanelOpen = ref(false)
const visibleDevices = computed(() =>
  store.devices.filter(
    (device) =>
      (typeFilter.value === 'all' || device.type === typeFilter.value) &&
      (filter.value === 'all' ||
        (filter.value === 'online' && device.online) ||
        (filter.value === 'offline' && !device.online)) &&
      (!roomSearch.value || device.room.includes(roomSearch.value)),
  ),
)

// 批量升级：进入选择模式后由人工勾选，且一个批次只能是同一种设备类型。
const batchMode = ref(false)
const selectedIds = ref<string[]>([])
const selectedDevices = computed(() =>
  store.devices.filter((device) => selectedIds.value.includes(device.id)),
)
// 勾选第一台设备即锁定类型，其它类型的复选框整批置灰。
const lockedType = computed<DeviceType | null>(() => selectedDevices.value[0]?.type ?? null)
const visibleIds = computed(() => visibleDevices.value.map((device) => device.id))
// 已勾选但被筛选条件藏起来的设备：仍然参与升级，所以要单独提示数量。
const hiddenSelectedCount = computed(
  () => selectedDevices.value.filter((device) => !visibleIds.value.includes(device.id)).length,
)
// 当前筛选结果里还能勾选的设备（自身可升级 + 不与类型锁冲突），「全选」只作用于这批。
const selectableVisible = computed(() => visibleDevices.value.filter((device) => canSelect(device)))
const allVisibleSelected = computed(
  () =>
    selectableVisible.value.length > 0 &&
    selectableVisible.value.every((device) => selectedIds.value.includes(device.id)),
)

function canSelect(device: Device) {
  if (!store.canUpgrade(device)) return false
  return !lockedType.value || device.type === lockedType.value
}

// 复选框置灰的原因：挂在 label 的 title 上，鼠标悬停即可看到。
function selectHint(device: Device) {
  if (!device.online) return '设备离线，无法升级'
  if (store.otaBusy(device)) return '设备升级中，请等待完成'
  const locked = lockedType.value
  if (locked && device.type !== locked)
    return `本批次为${store.deviceMeta[locked].label}，不能与${store.deviceMeta[device.type].label}混选`
  return '勾选后加入本批次升级，目标版本由本次上传的固件包决定'
}

function setSelected(device: Device, checked: boolean) {
  if (checked) {
    if (!canSelect(device) || selectedIds.value.includes(device.id)) return
    selectedIds.value = [...selectedIds.value, device.id]
    return
  }
  selectedIds.value = selectedIds.value.filter((id) => id !== device.id)
}

function enterBatchMode() {
  batchMode.value = true
  selectedIds.value = []
}

function exitBatchMode() {
  batchMode.value = false
  selectedIds.value = []
}

function toggleSelectAllVisible() {
  const ids = selectableVisible.value.map((device) => device.id)
  if (allVisibleSelected.value) {
    selectedIds.value = selectedIds.value.filter((id) => !ids.includes(id))
    return
  }
  selectedIds.value = [...new Set([...selectedIds.value, ...ids])]
}

function startBatchUpgrade() {
  store.requestUpgradeMany(selectedDevices.value)
}

// 「全选」的悬停说明：点得到时说清会勾多少台，点不到时说清为什么。
const selectAllHint = computed(() =>
  !selectableVisible.value.length
    ? '当前筛选结果里没有可升级的设备'
    : allVisibleSelected.value
      ? '取消勾选当前筛选结果里的设备'
      : `勾选当前筛选结果里 ${selectableVisible.value.length} 台可升级设备`,
)

// 切换「设备类型」到与当前批次不同的类型，说明用户在换一个类型做事，直接清空批次：
// 否则被筛选藏起来的旧类型设备会一直占着类型锁，新类型一台都勾不动。
watch(typeFilter, (next) => {
  const locked = lockedType.value
  if (!batchMode.value || !locked || next === 'all' || next === locked) return
  selectedIds.value = []
  store.notify(`已切换到${store.deviceMeta[next].label}，本批次已清空`)
})

// 提交批次成功才会生成新的批次 id：据此退出选择模式并打开批次面板。
// 只认批次 id，不去看设备状态——否则"关掉上传固件弹窗"这种没提交的动作会被误判成已提交。
watch(
  () => store.otaBatch?.id,
  (id) => {
    if (!id) return
    exitBatchMode()
    batchPanelOpen.value = true
  },
)

// 批次结束后只留"有失败 / 有未下发"的角标提醒；全部成功就回到原先干净的「批量升级」按钮。
const batchAlert = computed(
  () => !store.batchRunning && (store.batchStats.failed > 0 || store.batchStats.stopped > 0),
)
const batchEntryNeedsAttention = computed(() => store.batchRunning || batchAlert.value)
const batchEntryHint = computed(() =>
  store.batchRunning
    ? '本批次升级中，打开批次面板查看进度'
    : batchAlert.value
      ? '上一批还有设备没升上去，先看结果或重试'
      : '批量升级：选好同类型设备后上传固件',
)

// 工具栏按钮按状态分流：跑着的时候看进度；上一批还有没升上去的设备，先回面板处理
// （重试，或人为确认后跳过）；全成功则直接进下一批的勾选模式。
function onToolbarAction() {
  if (store.batchRunning || batchAlert.value) {
    batchPanelOpen.value = true
    return
  }
  batchPanelOpen.value = false
  enterBatchMode()
}

// 批次面板里点「进入下一批升级」：收起面板回到勾选模式，重新挑设备、重新上传固件。
function startNextBatch() {
  batchPanelOpen.value = false
  enterBatchMode()
}

// 批次进行中不允许给批次外的设备下发单台升级，避免同时存在两个固件包上下文。
function singleUpgradeHint(device: Device) {
  if (!device.online) return '设备离线，无法升级'
  if (store.otaBusy(device)) return '设备升级中，请等待完成'
  if (store.batchRunning) return '本批次升级中，完成或停止后才能下发新设备'
  return '选择本地固件包后开始升级'
}

const singleUpgradeBlocked = (device: Device) =>
  !device.online ||
  store.otaBusy(device) ||
  (store.batchRunning && device.otaBatchId !== store.otaBatch?.id)
</script>

<template>
  <div class="toolbar">
    <label>
      房间号
      <span class="search-box ota-room-search">
        <input v-model="roomSearch" placeholder="如 803" />
      </span>
    </label>
    <label
      >设备类型
      <select v-model="typeFilter">
        <option value="all">全部类型</option>
        <option v-for="(meta, type) in store.deviceMeta" :key="type" :value="type">
          {{ meta.label }}
        </option>
      </select></label
    ><label
      >在线状态
      <select v-model="filter">
        <option value="online">在线</option>
        <option value="offline">离线</option>
        <option value="all">全部</option>
      </select></label
    >
    <div v-if="isDev" class="dev-injection">
      <span>故障注入</span>
      <select v-model="store.otaFault">
        <option value="none">正常</option>
        <option value="checksum">固件校验失败</option>
        <option value="write">写入失败</option>
        <option value="timeout">超时失联</option>
        <option value="batch-partial">批次内每 5 台失败 3 台</option>
      </select>
    </div>
    <div v-if="batchMode" class="batch-actions push-right">
      <span class="count-tag">已选 {{ selectedDevices.length }} 台</span>
      <!-- 「设备类型」为全部类型时不给全选：跨类型一次性勾选容易误伤，先筛类型再全选。 -->
      <button
        v-if="typeFilter !== 'all'"
        class="ghost-button"
        :disabled="!selectableVisible.length"
        :title="selectAllHint"
        @click="toggleSelectAllVisible"
      >
        {{ allVisibleSelected ? '取消全选' : '全选' }}
      </button>
      <button class="ghost-button" @click="exitBatchMode">取消</button>
      <button class="primary-button" :disabled="!selectedDevices.length" @click="startBatchUpgrade">
        <Zap :size="16" /> 开始升级
      </button>
    </div>
    <!-- 批次进行中、或上一批还有没升上去的设备时，这个按钮都是"打开批次面板"；
         只有全成功时才直接进下一批的勾选模式。 -->
    <button
      v-else
      class="primary-button push-right batch-entry"
      :class="{ running: store.batchRunning }"
      :title="batchEntryHint"
      @click="onToolbarAction"
    >
      <ListChecks v-if="batchEntryNeedsAttention" :size="16" />
      <Zap v-else :size="16" />
      批量升级
      <span v-if="store.batchRunning" class="batch-badge">
        进行中 {{ store.batchStats.running
        }}<template v-if="store.batchStats.failed"> · 失败 {{ store.batchStats.failed }}</template>
      </span>
      <span v-else-if="batchAlert" class="batch-badge done">
        上次批次 · 成功 {{ store.batchStats.success
        }}<template v-if="store.batchStats.failed"> · 失败 {{ store.batchStats.failed }}</template
        ><template v-if="store.batchStats.stopped">
          · 未下发 {{ store.batchStats.stopped }}</template
        >
      </span>
    </button>
  </div>
  <p v-if="batchMode" class="batch-hint">
    <CircleAlert :size="14" />
    <span
      >批量升级仅支持同一类型设备，{{
        lockedType
          ? `本批次已锁定「${store.deviceMeta[lockedType].label}」，其它类型不可勾选`
          : '勾选第一台设备后将锁定其类型'
      }}<template v-if="hiddenSelectedCount">
        · 已选 {{ selectedDevices.length }} 台中有
        {{ hiddenSelectedCount }} 台不在当前筛选内</template
      ></span
    >
  </p>
  <SectionHeading title="固件升级任务" :icon="Upload" />
  <section class="ota-list">
    <article
      v-for="device in visibleDevices"
      :key="device.id"
      class="ota-item"
      :class="{ picked: batchMode && selectedIds.includes(device.id) }"
    >
      <label v-if="batchMode" class="ota-check" :title="selectHint(device)">
        <input
          type="checkbox"
          :checked="selectedIds.includes(device.id)"
          :disabled="!canSelect(device)"
          @change="setSelected(device, ($event.target as HTMLInputElement).checked)"
        />
      </label>
      <div class="device-icon">
        <component :is="store.deviceMeta[device.type].icon" :size="20" />
      </div>
      <div class="ota-info">
        <strong>{{ device.room }} · {{ device.name }}</strong
        ><span
          >当前固件 <b>{{ device.firmware }}</b> · {{ device.online ? '在线' : '离线' }}</span
        >
        <!-- 状态行与批量面板共用同一个组件，文案不会两处走偏。 -->
        <OtaStatusLine :device="device" />
      </div>
      <button
        v-if="!batchMode"
        class="primary-button"
        :disabled="singleUpgradeBlocked(device)"
        :title="singleUpgradeHint(device)"
        @click="store.requestUpgrade(device)"
      >
        {{ store.otaBusy(device) ? '升级中…' : '开始升级' }}
      </button>
    </article>
  </section>
  <OtaBatchDialog v-model:open="batchPanelOpen" @next-batch="startNextBatch" />
</template>
