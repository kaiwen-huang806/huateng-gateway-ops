<script setup lang="ts">
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Hash,
  History,
  Minus,
  Plus,
  Upload,
  VolumeX,
  X,
} from '@lucide/vue'
import { computed, nextTick, ref } from 'vue'
import { useGatewayStore } from '@/stores/gateway'
import LogHistoryDialog from '@/components/logs/LogHistoryDialog.vue'
import { SWITCH_COUNT_BY_TYPE, type Device } from '@/types/gateway'
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
  closeTemperatureMenu()
  closeTuning()
  store.selectedDevice = null
}

type ControlSpec = {
  key: string
  label: string
  kind:
    | 'switch'
    | 'dimmer'
    | 'range'
    | 'stepper'
    | 'number'
    | 'readonly'
    | 'select'
    | 'action'
    | 'action-group'
  min?: number
  max?: number
  unit?: string
  options?: string[]
  temperaturePicker?: boolean
  brightnessKey?: string
}

const temperatureOptions = Array.from({ length: 15 }, (_, index) => `${index + 16}`)
const kettleTemperatureOptions = Array.from({ length: 7 }, (_, index) => `${100 - index * 10}`)
const kettleTemperatureSpec: ControlSpec = {
  key: 'temperature',
  label: '目标温度',
  kind: 'select',
  options: kettleTemperatureOptions,
  unit: '°C',
}
const tuningDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const tuningOpen = ref(false)
const tuningValue = ref('')
const temperatureMenu = ref<{
  anchor: HTMLButtonElement
  spec: ControlSpec
  top: number
  left: number
  width: number
  maxHeight: number
} | null>(null)

function switchControlSpecs(type: Device['type']): ControlSpec[] {
  const count = SWITCH_COUNT_BY_TYPE[type] ?? 0
  return Array.from({ length: count }, (_, index) => ({
    key: `switch${index + 1}`,
    label: `开关${index + 1}`,
    kind: 'switch' as const,
  }))
}

function dimmerControlSpecs(count: number): ControlSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `lamp${index + 1}Power`,
    label: `灯${index + 1}`,
    kind: 'dimmer' as const,
    brightnessKey: `lamp${index + 1}Brightness`,
    min: 0,
    max: 100,
    unit: '%',
  }))
}

const controlMap: Record<Device['type'], ControlSpec[]> = {
  lock: [
    { key: 'locked', label: '门锁状态', kind: 'switch' },
    { key: 'remoteUnlock', label: '远程开锁', kind: 'action' },
  ],
  'card-power': [
    { key: 'inserted', label: '插卡状态', kind: 'switch' },
    { key: 'doorMagnet', label: '门磁状态', kind: 'switch' },
  ],
  'switch-1k': switchControlSpecs('switch-1k'),
  'switch-2k': switchControlSpecs('switch-2k'),
  'switch-3k': switchControlSpecs('switch-3k'),
  'switch-4k': switchControlSpecs('switch-4k'),
  'switch-6k': switchControlSpecs('switch-6k'),
  thermostat: [
    { key: 'power', label: '电源开关', kind: 'switch' },
    {
      key: 'temperature',
      label: '目标温度',
      kind: 'select',
      options: temperatureOptions,
      unit: '°C',
    },
    { key: 'mode', label: '运行模式', kind: 'select', options: ['制冷', '制热', '送风', '自动'] },
    { key: 'fan', label: '风速', kind: 'select', options: ['自动', '低速', '中速', '高速'] },
  ],
  'remote-ac': [
    { key: 'power', label: '空调开关', kind: 'switch' },
    {
      key: 'temperature',
      label: '目标温度',
      kind: 'select',
      options: temperatureOptions,
      unit: '°C',
    },
    { key: 'mode', label: '运行模式', kind: 'select', options: ['制冷', '制热', '送风', '除湿'] },
    { key: 'fan', label: '风速', kind: 'select', options: ['自动', '低速', '中速', '高速'] },
  ],
  'remote-tv': [
    { key: 'power', label: '电视开关', kind: 'switch' },
    { key: 'volume', label: '音量', kind: 'stepper' },
    { key: 'channel', label: '频道', kind: 'stepper' },
    { key: 'source', label: '信号源', kind: 'select', options: ['网络', '直播'] },
  ],
  curtain: [
    { key: 'motion', label: '开合控制', kind: 'action-group', options: ['开', '关', '停'] },
    { key: 'openingPercentage', label: '开合比例', kind: 'range', min: 0, max: 100, unit: '%' },
  ],
  'sheer-curtain': [
    { key: 'motion', label: '开合控制', kind: 'action-group', options: ['开', '关', '停'] },
    { key: 'openingPercentage', label: '开合比例', kind: 'range', min: 0, max: 100, unit: '%' },
  ],
  'smart-socket': [
    { key: 'power', label: '电源开关', kind: 'switch' },
  ],
  pir: [],
  presence: [],
  relay: [{ key: 'power', label: '通断控制', kind: 'switch' }],
  'dimmer-2way': [
    ...dimmerControlSpecs(2),
  ],
  'dimmer-4way': [
    ...dimmerControlSpecs(4),
  ],
  'dimmer-mirror': [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'brightness', label: '亮度调节', kind: 'range', min: 0, max: 100, unit: '%' },
  ],
  kettle: [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'mode', label: '工作模式', kind: 'select', options: ['保温', '加热', '待机'] },
  ],
  hairdryer: [
    { key: 'power', label: '电源开关', kind: 'switch' },
    { key: 'temperatureLevel', label: '温度档位', kind: 'select', options: ['0 档', '1 档', '2 档', '3 档'] },
    { key: 'level', label: '风速档位', kind: 'select', options: ['0 档', '1 档', '2 档', '3 档'] },
  ],
  'light-driver': [...dimmerControlSpecs(2)],
}

const specs = computed(() => (store.selectedDevice ? controlMap[store.selectedDevice.type] : []))
const statusOnlySpecs: Partial<Record<Device['type'], ControlSpec[]>> = {
  'smart-socket': [
    { key: 'current', label: '实时电流', kind: 'number', unit: 'A' },
    { key: 'powerUsage', label: '实时功率', kind: 'number', unit: 'W' },
  ],
  lock: [{ key: 'battery', label: '实时电量', kind: 'number', unit: '%' }],
  thermostat: [{ key: 'indoorTemperature', label: '室内温度', kind: 'number', unit: '°C' }],
  kettle: [
    kettleTemperatureSpec,
    { key: 'waterTemperature', label: '当前水温', kind: 'number', unit: '°C' },
    { key: 'current', label: '工作电流', kind: 'number', unit: 'A' },
    { key: 'voltage', label: '工作电压', kind: 'number', unit: 'V' },
  ],
  hairdryer: [
    { key: 'temperatureLevel', label: '温度档位', kind: 'number', unit: '' },
    { key: 'voltage', label: '工作电压', kind: 'number', unit: 'V' },
    { key: 'ntcTemperature', label: 'NTC温度', kind: 'number', unit: '°C' },
    { key: 'motorRpm', label: '电机转速', kind: 'number', unit: 'rpm' },
    { key: 'motorCurrent', label: '电机电流', kind: 'number', unit: 'A' },
  ],
  pir: [{ key: 'detected', label: '感应是否有人', kind: 'readonly' }],
  presence: [{ key: 'present', label: '感应是否有人', kind: 'readonly' }],
}
const statusSpecs = computed(() => {
  const type = store.selectedDevice?.type
  const baseSpecs =
    type === 'remote-ac' || type === 'remote-tv'
      ? specs.value.filter((spec) => spec.key === 'power')
      : specs.value.filter((spec) => spec.kind !== 'action' && spec.kind !== 'action-group')
  const statusBaseSpecs = baseSpecs.flatMap((spec) =>
    spec.kind === 'dimmer'
      ? [
          { ...spec, kind: 'switch' as const },
          {
            ...spec,
            key: spec.brightnessKey!,
            label: `${spec.label}亮度`,
            kind: 'number' as const,
            unit: '%',
          },
        ]
      : [spec],
  )
  return [...statusBaseSpecs, ...(type ? (statusOnlySpecs[type] ?? []) : [])]
})
const recentLogs = computed(() =>
  store.selectedDevice ? sortLogsDesc(store.selectedDevice.logs).slice(0, LOG_PREVIEW_LIMIT) : [],
)

function update(key: string, value: string | number | boolean) {
  if (!store.selectedDevice) return
  const spec = controlMap[store.selectedDevice.type].find((item) => item.key === key)
  if (spec?.kind === 'number' && typeof value === 'number' && Number.isFinite(value)) {
    value = Math.min(spec.max ?? value, Math.max(spec.min ?? value, value))
  }
  store.setDeviceParam(store.selectedDevice, key, value)
}

function stepValue(spec: ControlSpec, direction: -1 | 1) {
  if (!store.selectedDevice) return
  const adjustment = direction === 1 ? '增加一格' : '减少一格'
  store.sendDeviceCommand(store.selectedDevice, `${spec.label}${adjustment}`)
}

function sendAction(command: string) {
  if (!store.selectedDevice) return
  store.sendDeviceCommand(store.selectedDevice, command)
}

function openTuning() {
  tuningValue.value = ''
  tuningOpen.value = true
}

function closeTuning() {
  tuningOpen.value = false
  tuningValue.value = ''
}

function pressTuningDigit(digit: string) {
  if (tuningValue.value.length >= 3) return
  tuningValue.value += digit
}

function clearTuning() {
  tuningValue.value = ''
}

function deleteTuningDigit() {
  tuningValue.value = tuningValue.value.slice(0, -1)
}

function confirmTuning() {
  if (!store.selectedDevice || !tuningValue.value) return
  store.sendDeviceCommand(store.selectedDevice, `频道切换至 ${tuningValue.value}`)
  closeTuning()
}

function displayValue(value: string | number | boolean | undefined, spec: ControlSpec) {
  if ((spec.key === 'detected' || spec.key === 'present') && typeof value === 'boolean') {
    return value ? '有人' : '无人'
  }
  if (spec.key === 'doorMagnet' && typeof value === 'boolean') {
    return value ? '门已打开' : '门已关闭'
  }
  if (typeof value === 'boolean') return value ? '开启' : '关闭'
  return `${value ?? '--'}${spec.unit ?? ''}`
}

function isTemperatureSpec(spec: ControlSpec) {
  return spec.key === 'temperature' && spec.options === temperatureOptions
}

const temperatureMenuStyle = computed(() => {
  const menu = temperatureMenu.value
  if (!menu) return {}
  return {
    top: `${menu.top}px`,
    left: `${menu.left}px`,
    width: `${menu.width}px`,
    maxHeight: `${menu.maxHeight}px`,
  }
})

function closeTemperatureMenu() {
  temperatureMenu.value = null
}

async function toggleTemperatureMenu(spec: ControlSpec, event: Event) {
  const trigger = event.currentTarget as HTMLButtonElement
  if (temperatureMenu.value?.anchor === trigger) {
    closeTemperatureMenu()
    return
  }
  const rect = trigger.getBoundingClientRect()
  const top = rect.bottom + 5
  temperatureMenu.value = {
    anchor: trigger,
    spec,
    top,
    left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
    width: Math.max(120, rect.width),
    maxHeight: Math.max(48, window.innerHeight - top - 12),
  }
  await nextTick()
  const menu = document.querySelector('.temperature-menu--teleport') as HTMLElement | null
  if (!menu) return
  const active = menu.querySelector('.active') as HTMLElement | null
  if (active) {
    menu.scrollTop = Math.max(0, active.offsetTop - menu.clientHeight / 2)
  }
}

function selectTemperature(spec: ControlSpec, option: string) {
  update(spec.key, option)
  closeTemperatureMenu()
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
          @click="closeTemperatureMenu(); closeTuning(); store.deviceTab = tab[0]"
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
            <div v-for="spec in statusSpecs" :key="spec.key">
              <small>{{
                spec.key === 'power'
                  ? store.selectedDevice.type === 'remote-ac'
                    ? '空调状态'
                    : store.selectedDevice.type === 'remote-tv'
                      ? '电视状态'
                    : '开关状态'
                  : store.selectedDevice.type === 'kettle' && spec.key === 'temperature'
                    ? '目标温度'
                    : spec.label
              }}</small
              ><b>{{ displayValue(store.selectedDevice.params[spec.key], spec) }}</b>
            </div>
          </div>
        </template>
        <template v-else-if="store.deviceTab === 'control'">
          <div class="control-list">
            <div
              v-for="spec in specs"
              :key="spec.key"
              class="control-row"
              :class="{ 'control-row--dimmer': spec.kind === 'dimmer' }"
            >
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
                <div v-if="spec.temperaturePicker" class="temperature-picker">
                  <button
                    class="temperature-trigger"
                    type="button"
                    aria-label="选择保温温度"
                    @click="toggleTemperatureMenu(kettleTemperatureSpec, $event)"
                  >
                    {{ store.selectedDevice.params.temperature }}°C
                  </button>
                </div>
              </template>
              <template v-else-if="spec.kind === 'dimmer'">
                <button
                  class="switch"
                  :class="{ on: store.selectedDevice.params[spec.key] }"
                  :aria-label="`切换${spec.label}`"
                  @click="update(spec.key, !store.selectedDevice.params[spec.key])"
                >
                  <i></i>
                </button>
                <b>{{ store.selectedDevice.params[spec.key] ? '开启' : '关闭' }}</b>
                <span class="inline-control-label">亮度</span>
                <input
                  :value="store.selectedDevice.params[spec.brightnessKey!]"
                  type="range"
                  :min="spec.min"
                  :max="spec.max"
                  @change="
                    update(spec.brightnessKey!, Number(($event.target as HTMLInputElement).value))
                  "
                />
                <b>{{ displayValue(store.selectedDevice.params[spec.brightnessKey!], spec) }}</b>
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
              <template v-else-if="spec.kind === 'stepper'">
                <div class="stepper-control">
                  <button
                    type="button"
                    :aria-label="`${spec.label}减一`"
                    @click="stepValue(spec, -1)"
                  >
                    <Minus v-if="spec.key === 'volume'" :size="16" />
                    <ChevronDown v-else :size="16" />
                  </button>
                  <button
                    type="button"
                    :aria-label="`${spec.label}加一`"
                    @click="stepValue(spec, 1)"
                  >
                    <Plus v-if="spec.key === 'volume'" :size="16" />
                    <ChevronUp v-else :size="16" />
                  </button>
                </div>
                <button
                  v-if="spec.key === 'volume'"
                  class="tv-mute-button"
                  type="button"
                  title="静音"
                  aria-label="静音"
                  @click="sendAction('静音')"
                >
                  <VolumeX :size="15" />静音
                </button>
                <button
                  v-if="spec.key === 'channel'"
                  class="tv-tuning-button"
                  type="button"
                  title="打开调频键盘"
                  aria-label="调频"
                  @click="openTuning"
                >
                  <Hash :size="15" />调频
                </button>
              </template>
              <template v-else-if="spec.kind === 'action-group'">
                <div class="action-group">
                  <button
                    v-for="option in spec.options"
                    :key="option"
                    type="button"
                    @click="sendAction(option)"
                  >
                    {{ option }}
                  </button>
                </div>
              </template>
              <template v-else-if="spec.kind === 'select'">
                <div v-if="isTemperatureSpec(spec)" class="temperature-picker">
                  <button
                    class="temperature-trigger"
                    type="button"
                    :aria-label="`选择${spec.label}`"
                    @click="toggleTemperatureMenu(spec, $event)"
                  >
                    {{ store.selectedDevice.params[spec.key] }}{{ spec.unit }}
                  </button>
                </div>
                <select
                  v-else
                  :value="store.selectedDevice.params[spec.key]"
                  @change="update(spec.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="option in spec.options" :key="option">{{ option }}</option>
                </select>
                <span
                  v-if="store.selectedDevice.type === 'kettle' && spec.key === 'mode'"
                  class="kettle-temperature-label"
                >
                  目标温度
                </span>
                <select
                  v-if="store.selectedDevice.type === 'kettle' && spec.key === 'mode'"
                  class="kettle-temperature-select"
                  :value="store.selectedDevice.params.temperature"
                  :disabled="store.selectedDevice.params.mode !== '加热'"
                  aria-label="目标温度"
                  @change="update('temperature', Number(($event.target as HTMLSelectElement).value))"
                >
                  <option v-for="option in kettleTemperatureOptions" :key="option" :value="option">
                    {{ option }}°C
                  </option>
                </select>
              </template>
              <template v-else>
                <button
                  class="primary-button"
                  @click="sendAction(spec.label)"
                >
                  <CircleAlert :size="14" />执行
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
    <div v-if="tuningOpen" class="tv-tuning-backdrop" @click.self="closeTuning">
      <section class="tv-tuning-dialog" role="dialog" aria-modal="true" aria-label="电视调频">
        <header class="tv-tuning-header">
          <div>
            <strong>电视调频</strong>
            <span>输入频道数字</span>
          </div>
          <b>{{ tuningValue || '—' }}</b>
        </header>
        <div class="tv-tuning-keypad">
          <button
            v-for="digit in tuningDigits"
            :key="digit"
            type="button"
            :aria-label="`输入数字${digit}`"
            :disabled="tuningValue.length >= 3"
            @click="pressTuningDigit(digit)"
          >
            {{ digit }}
          </button>
          <button
            type="button"
            class="tv-tuning-action tv-tuning-clear"
            :disabled="!tuningValue"
            @click="clearTuning"
          >
            清除
          </button>
          <button
            type="button"
            class="tv-tuning-action tv-tuning-delete"
            :disabled="!tuningValue"
            @click="deleteTuningDigit"
          >
            删除
          </button>
          <button type="button" class="tv-tuning-back" @click="closeTuning">取消</button>
          <button
            type="button"
            class="tv-tuning-confirm"
            :disabled="!tuningValue"
            @click="confirmTuning"
          >
            确定
          </button>
        </div>
      </section>
    </div>
    <Teleport to="body">
      <div
        v-if="temperatureMenu"
        class="temperature-menu temperature-menu--teleport"
        :style="temperatureMenuStyle"
        @click.stop
      >
        <button
          v-for="option in temperatureMenu.spec.options"
          :key="option"
          type="button"
          :class="{
            active:
              String(store.selectedDevice?.params[temperatureMenu.spec.key]) === option,
          }"
          @click="selectTemperature(temperatureMenu.spec, option)"
        >
          {{ option }}{{ temperatureMenu.spec.unit }}
        </button>
      </div>
    </Teleport>
    <LogHistoryDialog
      v-if="historyDevice"
      :key="historyDevice.id"
      :device="historyDevice"
      @close="historyDevice = null"
    />
  </div>
</template>
