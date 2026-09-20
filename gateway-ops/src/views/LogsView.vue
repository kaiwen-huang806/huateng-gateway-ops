<script setup lang="ts">
import { History } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useGatewayStore } from '@/stores/gateway'
import LogHistoryDialog from '@/components/logs/LogHistoryDialog.vue'
import type { Device, DeviceType, LogSource } from '@/types/gateway'
import { logSourceText, logSourcesOf } from '@/utils/logs'

const store = useGatewayStore()
// 房间号搜索走文本输入（对齐 OTA 页的房间筛选），设备类型与级别是下拉。
const roomSearch = ref('')
const typeFilter = ref<DeviceType | 'all'>('all')
const level = ref('全部级别')
// 动作来源筛选。选项只取表格里实际出现过的来源（见 sourceOptions），不用协议里的全量取值。
const sourceFilter = ref<LogSource | 'all'>('all')
// 打开「以往日志」弹窗的设备，为空时不渲染弹窗。
const historyDevice = ref<Device | null>(null)

// 动作来源筛选项：从「每台设备最新一条」里取出现过的来源，按协议枚举顺序排列。
// 表格行本来就受这些来源约束，所以每个选项都能筛出结果。
const sourceOptions = computed(() => logSourcesOf(store.deviceLogs.map((row) => row.log)))

// 表格一行代表一台设备，展示的始终是它最新的一条日志。
const rows = computed(() =>
  store.deviceLogs.filter(
    ({ device, log }) =>
      (typeFilter.value === 'all' || device.type === typeFilter.value) &&
      (level.value === '全部级别' || log.level === level.value) &&
      (sourceFilter.value === 'all' || log.source === sourceFilter.value) &&
      (!roomSearch.value || device.room.includes(roomSearch.value)),
  ),
)
</script>

<template>
  <div class="toolbar">
    <label>
      房间号
      <span class="search-box log-room-search">
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
      >级别
      <select v-model="level">
        <option>全部级别</option>
        <option>INFO</option>
        <option>WARN</option>
        <option>ERROR</option>
      </select></label
    ><label
      >动作来源
      <select v-model="sourceFilter">
        <option value="all">全部来源</option>
        <option v-for="value in sourceOptions" :key="value" :value="value">
          {{ logSourceText(value) }}
        </option>
      </select></label
    >
    <b class="count-tag">共 {{ rows.length }} 台设备</b>
  </div>
  <div class="panel table-panel">
    <table>
      <thead>
        <tr>
          <th>时间</th>
          <th>房间</th>
          <th>设备</th>
          <th>级别</th>
          <th>动作来源</th>
          <th>描述</th>
          <th>历史日志</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.device.id">
          <td class="mono">{{ row.log.time }}</td>
          <td>{{ row.device.room }}</td>
          <td>{{ row.device.name }}</td>
          <td>
            <b class="level" :class="row.log.level">{{ row.log.level }}</b>
          </td>
          <td>{{ logSourceText(row.log.source) }}</td>
          <td>{{ row.log.message }}</td>
          <td>
            <button class="text-button" title="查看以往日志" @click="historyDevice = row.device">
              <History :size="14" />查看以往日志
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="7" class="empty-row">没有符合筛选条件的设备日志</td>
        </tr>
      </tbody>
    </table>
  </div>
  <LogHistoryDialog
    v-if="historyDevice"
    :key="historyDevice.id"
    :device="historyDevice"
    @close="historyDevice = null"
  />
</template>
