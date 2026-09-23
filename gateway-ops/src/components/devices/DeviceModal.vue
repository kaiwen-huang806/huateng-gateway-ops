<script setup lang="ts">
import { Check, CircleAlert, History, Upload, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useGatewayStore } from '@/stores/gateway'
import LogHistoryDialog from '@/components/logs/LogHistoryDialog.vue'
import type { Device } from '@/types/gateway'
import { logSourceText, sortLogsDesc } from '@/utils/logs'

const store = useGatewayStore()
const LOG_PREVIEW_LIMIT = 15
const historyDevice = ref<Device | null>(null)
const tabs = [
  ['status', '实时状态'],
  ['control', '控制下发'],
  ['log', '运行日志'],
  ['ota', 'OTA 升级'],
] as const

function close() {
  store.selectedDevice = null
}

type ControlSpec = {
  key: string
  label: string
  kind: 'switch' | 'range' | 'number' | 'select' | 'action'
  min?: number
  max?: number
  unit?: string
  options?: string[]
}

const controlMap: Record<Device['type'], ControlSpec[]> = {
  lock: [
    { key: 'locked', label: '门锁状态', kind: 'switch' },
    { key: 'remoteUnlock', label: '远程开锁', kind: 'action' },
  ],
  'card-power': [{ key: 'inserted', label: '插卡状态', kind: 'switch' }],
  'switch-1k': [{ key: 'power', label: '电源开关', kind: 'switch' }],
  'switch-2k': [{ key: 'power', label: '电源开关', kind: 'switch' }],
  'switch-3k': [{ key: 'power', label: '电源开关', kind: 'switch' }],
  'switch-4k': [{ key: 'power', label: '电源开关', kind: 'switch' }],
  'switch-6k': [{ key: 'power', label: '电源开关', kind: 'switch' }],
  thermostat: [
    { key: 'mode', label: '运行模式', kind: 'select', options: ['制冷', '制热', '送风', '自动'] },
    { key: 'temperature', label: '目标温度', kind: 'number', unit: '°C' },
    { key: 'fan', label: '风速', kind: 'select', options: ['自动', '低速', '中速', '高速'] },
    { key: 'locked', label: '面板锁定', kind: 'switch' },
  ],
  'remote-ac': [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'mode', label: '运行模式', kind: 'select', options: ['制冷', '制热', '送风', '除湿'] },
    { key: 'temperature', label: '目标温度', kind: 'number', unit: '°C' },
    { key: 'fan', label: '风速', kind: 'select', options: ['自动', '低速', '中速', '高速'] },
  ],
  'remote-tv': [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'volume', label: '音量', kind: 'range', min: 0, max: 100, unit: '%' },
    {
      key: 'source',
      label: '信号源',
      kind: 'select',
      options: ['HDMI 1', 'HDMI 2', '投屏', '有线电视'],
    },
  ],
  curtain: [{ key: 'open', label: '开启比例', kind: 'range', min: 0, max: 100, unit: '%' }],
  'sheer-curtain': [
    { key: 'open', label: '开启比例', kind: 'range', min: 0, max: 100, unit: '%' },
  ],
  'smart-socket': [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'current', label: '实时电流', kind: 'number', unit: 'A' },
  ],
  pir: [
    { key: 'detected', label: '红外触发', kind: 'switch' },
    { key: 'sensitivity', label: '灵敏度', kind: 'range', min: 0, max: 100, unit: '%' },
  ],
  presence: [
    { key: 'present', label: '存在状态', kind: 'switch' },
    { key: 'confidence', label: '检测置信度', kind: 'range', min: 0, max: 100, unit: '%' },
  ],
  relay: [{ key: 'power', label: '通断控制', kind: 'switch' }],
  'dimmer-2way': [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'brightness', label: '亮度调节', kind: 'range', min: 0, max: 100, unit: '%' },
  ],
  'dimmer-4way': [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'brightness', label: '亮度调节', kind: 'range', min: 0, max: 100, unit: '%' },
  ],
  'dimmer-mirror': [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'brightness', label: '亮度调节', kind: 'range', min: 0, max: 100, unit: '%' },
  ],
  kettle: [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'temperature', label: '目标水温', kind: 'number', unit: '°C' },
    { key: 'keepWarm', label: '保温模式', kind: 'switch' },
  ],
  hairdryer: [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'level', label: '风速档位', kind: 'range', min: 1, max: 3, unit: ' 档' },
  ],
  'light-driver': [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'brightness', label: '亮度调节', kind: 'range', min: 0, max: 100, unit: '%' },
  ],
}

const specs = computed(() => (store.selectedDevice ? controlMap[store.selectedDevice.type] : []))
const recentLogs = computed(() =>
  store.selectedDevice ? sortLogsDesc(store.selectedDevice.logs).slice(0, LOG_PREVIEW_LIMIT) : [],
)

function update(key: string, value: string | number | boolean) {
  if (!store.selectedDevice) return
  store.setDeviceParam(store.selectedDevice, key, value)
}

function displayValue(value: string | number | boolean | undefined, spec: ControlSpec) {
  if (typeof value === 'boolean') return value ? '开启' : '关闭'
  return `${value ?? '--'}${spec.unit ?? ''}`
}
</script>

<template>
  <div v-if="store.selectedDevice" class="modal-backdrop" @click.self="close">
    <section class="device-modal">
      <header class="modal-header">
        <div class="device-icon large">
          <component :is="store.deviceMeta[store.selectedDevice.type].icon" :size="24" />
        </div>
        <div>
          <h2>{{ store.selectedDevice.room }} · {{ store.selectedDevice.name }}</h2>
          <p>
            {{ store.deviceMeta[store.selectedDevice.type].label }} · ID
            {{ store.selectedDevice.id }} · {{ store.selectedDevice.online ? '在线' : '离线' }} ·
            固件 {{ store.selectedDevice.firmware }}
          </p>
        </div>
        <button class="icon-button" title="关闭" @click="close"><X :size="20" /></button>
      </header>
      <nav class="modal-tabs">
        <button
          v-for="tab in tabs"
          :key="tab[0]"
          :class="{ active: store.deviceTab === tab[0] }"
          @click="store.deviceTab = tab[0]"
        >
          {{ tab[1] }}
        </button>
      </nav>
      <div class="modal-body">
        <template v-if="store.deviceTab === 'status'">
          <div class="param-grid">
            <div>
              <small>连接状态</small
              ><b :class="store.selectedDevice.online ? 'success-text' : 'danger-text'">{{
                store.selectedDevice.online ? '在线' : '离线'
              }}</b>
            </div>
            <div>
              <small>设备健康</small
              ><b
                :class="
                  store.statusOf(store.selectedDevice) === 'ok' ? 'success-text' : 'warning-text'
                "
                >{{ store.statusText(store.statusOf(store.selectedDevice)) }}</b
              >
            </div>
            <div><small>最近心跳</small><b>刚刚</b></div>
            <div v-for="spec in specs" :key="spec.key">
              <small>{{ spec.label }}</small
              ><b>{{ displayValue(store.selectedDevice.params[spec.key], spec) }}</b>
            </div>
          </div>
        </template>
        <template v-else-if="store.deviceTab === 'control'">
          <div class="control-list">
            <div v-for="spec in specs" :key="spec.key" class="control-row">
              <span>{{ spec.label }}</span>
              <template v-if="spec.kind === 'switch'">
                <button
                  class="switch"
                  :class="{ on: store.selectedDevice.params[spec.key] }"
                  :aria-label="`切换${spec.label}`"
                  @click="update(spec.key, !store.selectedDevice.params[spec.key])"
                >
                  <i></i>
                </button>
                <b>{{ store.selectedDevice.params[spec.key] ? '开启' : '关闭' }}</b>
              </template>
              <template v-else-if="spec.kind === 'range'">
                <input
                  :value="store.selectedDevice.params[spec.key]"
                  type="range"
                  :min="spec.min"
                  :max="spec.max"
                  @change="update(spec.key, Number(($event.target as HTMLInputElement).value))"
                />
                <b>{{ displayValue(store.selectedDevice.params[spec.key], spec) }}</b>
              </template>
              <template v-else-if="spec.kind === 'number'">
                <input
                  :value="store.selectedDevice.params[spec.key]"
                  class="number-input"
                  type="number"
                  @change="update(spec.key, Number(($event.target as HTMLInputElement).value))"
                />
                <b>{{ spec.unit }}</b>
              </template>
              <template v-else-if="spec.kind === 'select'">
                <select
                  :value="store.selectedDevice.params[spec.key]"
                  @change="update(spec.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="option in spec.options" :key="option">{{ option }}</option>
                </select>
              </template>
              <template v-else>
                <button
                  class="primary-button"
                  @click="store.notify(`${store.selectedDevice.name} 已执行远程开锁`)"
                >
                  <CircleAlert :size="14" /> 执行
                </button>
              </template>
            </div>
          </div>
          <p class="modal-hint">操作将通过网关下发至客房设备，并写入运行日志。</p>
        </template>
        <template v-else-if="store.deviceTab === 'log'">
          <div class="log-console-toolbar">
            <span>最新 {{ recentLogs.length }} 条 / 共 {{ store.selectedDevice.logs.length }} 条</span>
            <button
              class="text-button"
              title="查看以往日志"
              @click="historyDevice = store.selectedDevice"
            >
              <History :size="14" />查看以往日志
            </button>
          </div>
          <div class="log-console">
            <div class="log-console-head">
              <span>时间</span>
              <span>级别</span>
              <span>动作来源</span>
              <span>描述</span>
            </div>
            <div v-for="log in recentLogs" :key="`${log.at}-${log.message}`" class="log-console-row">
              <time>{{ log.time }}</time
              ><b :class="log.level">{{ log.level }}</b
              ><span>{{ logSourceText(log.source) }}</span
              ><span>{{ log.message }}</span>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="ota-modal-card">
            <div class="ota-version">
              当前固件 <b>{{ store.selectedDevice.firmware }}</b>
            </div>
            <div v-if="store.otaBusy(store.selectedDevice)" class="progress-wrap">
              <i :style="{ width: `${store.selectedDevice.progress}%` }"></i
              ><small>{{ store.otaStageText(store.selectedDevice) }}</small>
            </div>
            <div v-else-if="store.selectedDevice.otaStatus === 'failed'" class="ota-result failed">
              <strong
                ><CircleAlert :size="15" />升级失败 ·
                {{ store.selectedDevice.otaError?.message }}</strong
              >
              <dl class="ota-meta">
                <div>
                  <dt>目标版本</dt>
                  <dd>{{ store.selectedDevice.otaTarget ?? '—' }}</dd>
                </div>
                <div>
                  <dt>错误码</dt>
                  <dd>{{ store.selectedDevice.otaError?.code ?? '—' }}</dd>
                </div>
                <div>
                  <dt>失败时间</dt>
                  <dd>{{ store.selectedDevice.otaError?.at ?? '—' }}</dd>
                </div>
                <div>
                  <dt>尝试次数</dt>
                  <dd>{{ store.selectedDevice.otaAttempts }}</dd>
                </div>
              </dl>
              <p>
                设备可能仍停留在旧固件（当前
                {{
                  store.selectedDevice.firmware
                }}）。确认设备在线后可直接重试，无需重新上传固件包。
              </p>
            </div>
            <div v-else-if="store.selectedDevice.otaStatus === 'success'" class="ota-result ok">
              <Check :size="15" />已升级至 {{ store.selectedDevice.firmware }} ·
              {{ store.selectedDevice.otaUpdatedAt }}
            </div>
            <div class="ota-actions">
              <button
                class="primary-button"
                :disabled="!store.selectedDevice.online || store.otaBusy(store.selectedDevice)"
                @click="store.requestUpgrade(store.selectedDevice)"
              >
                <Upload :size="16" />
                {{ store.otaBusy(store.selectedDevice) ? '升级进行中…' : '开始固件升级' }}
              </button>
              <button
                v-if="store.selectedDevice.otaStatus === 'failed'"
                class="ghost-button"
                @click="store.retryUpgrade(store.selectedDevice)"
              >
                重试
              </button>
            </div>
          </div>
        </template>
      </div>
    </section>
    <LogHistoryDialog
      v-if="historyDevice"
      :key="historyDevice.id"
      :device="historyDevice"
      @close="historyDevice = null"
    />
  </div>
</template>
