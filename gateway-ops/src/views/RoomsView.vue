<script setup lang="ts">
import { ArrowLeft, Building2, Cpu } from '@lucide/vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGatewayStore } from '@/stores/gateway'
import type { Device, Room } from '@/types/gateway'
import SectionHeading from '@/components/common/SectionHeading.vue'

const route = useRoute()
const router = useRouter()
const store = useGatewayStore()

type DeviceCardParam = {
  label: string
  value: string
}

const switchDeviceTypes = new Set<Device['type']>([
  'switch-1k',
  'switch-2k',
  'switch-3k',
  'switch-4k',
  'switch-6k',
])

function textParam(value: Device['params'][string], fallback = '--') {
  return value === undefined ? fallback : String(value)
}

function numberParam(value: Device['params'][string], unit = '') {
  return typeof value === 'number' ? `${value}${unit}` : textParam(value)
}

function booleanParam(value: Device['params'][string], enabled: string, disabled: string) {
  return value ? enabled : disabled
}

function powerParam(value: Device['params'][string]) {
  return booleanParam(value, '已开启', '已关闭')
}

function deviceCardParams(device: Device): DeviceCardParam[] {
  const { params, type } = device

  if (switchDeviceTypes.has(type)) {
    return [{ label: '开关状态', value: powerParam(params.power) }]
  }

  switch (type) {
    case 'lock':
      return [{ label: '门锁状态', value: booleanParam(params.locked, '已上锁', '未上锁') }]
    case 'card-power':
      return [{ label: '插卡状态', value: booleanParam(params.inserted, '已插卡', '未插卡') }]
    case 'thermostat':
      return [
        { label: '运行模式', value: textParam(params.mode) },
        { label: '目标温度', value: numberParam(params.temperature, '°C') },
        { label: '风速', value: textParam(params.fan) },
        { label: '面板锁定', value: booleanParam(params.locked, '已锁定', '未锁定') },
      ]
    case 'remote-ac':
      return [
        { label: '电源状态', value: powerParam(params.power) },
        { label: '运行模式', value: textParam(params.mode) },
        { label: '目标温度', value: numberParam(params.temperature, '°C') },
        { label: '风速', value: textParam(params.fan) },
      ]
    case 'remote-tv':
      return [
        { label: '电源状态', value: powerParam(params.power) },
        { label: '音量', value: numberParam(params.volume) },
        { label: '信号源', value: textParam(params.source) },
      ]
    case 'curtain':
    case 'sheer-curtain':
      return [{ label: '开启比例', value: numberParam(params.open, '%') }]
    case 'smart-socket':
      return [
        { label: '电源状态', value: powerParam(params.power) },
        { label: '实时电流', value: numberParam(params.current, 'A') },
      ]
    case 'pir':
      return [
        { label: '红外触发', value: booleanParam(params.detected, '已触发', '未触发') },
        { label: '灵敏度', value: numberParam(params.sensitivity, '%') },
      ]
    case 'presence':
      return [
        { label: '存在状态', value: booleanParam(params.present, '有人', '无人') },
        { label: '检测置信度', value: numberParam(params.confidence, '%') },
      ]
    case 'relay':
      return [{ label: '通断状态', value: powerParam(params.power) }]
    case 'dimmer-2way':
    case 'dimmer-4way':
    case 'dimmer-mirror':
    case 'light-driver':
      return [
        { label: '电源状态', value: powerParam(params.power) },
        { label: '亮度', value: numberParam(params.brightness, '%') },
      ]
    case 'kettle':
      return [
        { label: '电源状态', value: powerParam(params.power) },
        { label: '目标水温', value: numberParam(params.temperature, '°C') },
        { label: '保温模式', value: booleanParam(params.keepWarm, '开启', '关闭') },
      ]
    case 'hairdryer':
      return [
        { label: '电源状态', value: powerParam(params.power) },
        { label: '风速档位', value: numberParam(params.level, ' 档') },
      ]
  }

  return []
}

// 当前房间由路由参数决定，刷新 /rooms/803 时会直接回到该房间的设备清单。
const selectedRoom = computed(() => {
  const roomId = route.params.roomId
  return (
    store.rooms.find((room) => room.id === (Array.isArray(roomId) ? roomId[0] : roomId)) ?? null
  )
})

const roomDevices = computed(() =>
  selectedRoom.value
    ? store.devices.filter((device) => selectedRoom.value?.devices.includes(device.id))
    : [],
)

function openRoom(room: Room) {
  router.push({ name: 'rooms', params: { roomId: room.id } })
}

function backToList() {
  store.selectedFloor = selectedRoom.value?.floor ?? store.selectedFloor
  router.push({ name: 'rooms' })
}
</script>

<template>
  <template v-if="!selectedRoom">
    <div class="tabs">
      <button
        v-for="floor in store.floors"
        :key="floor"
        :class="{ active: store.selectedFloor === floor }"
        @click="store.selectedFloor = floor"
      >
        {{ floor }}
      </button>
    </div>
    <SectionHeading
      :title="`${store.selectedFloor} ${store.floorRooms[0]?.category} · 房间列表`"
      :icon="Building2"
      ><template #default
        ><b class="count-tag">{{ store.floorRooms.length }} 间客房</b></template
      ></SectionHeading
    >
    <section class="room-card-grid">
      <button
        v-for="room in store.floorRooms"
        :key="room.id"
        class="room-card"
        @click="openRoom(room)"
      >
        <div class="room-card-top">
          <div>
            <strong>{{ room.id }}</strong
            ><span>{{ room.category }}</span>
          </div>
          <b
            class="badge"
            :class="store.statusOf(store.devices.find((device) => device.id === room.devices[0]))"
            >{{
              store.statusText(
                store.statusOf(store.devices.find((device) => device.id === room.devices[0])),
              )
            }}</b
          >
        </div>
        <div class="room-card-stats">
          <span
            >设备 <b>{{ room.devices.length }}</b></span
          ><span
            >在线
            <b class="success-text">{{
              room.devices.filter((id) => store.devices.find((device) => device.id === id)?.online)
                .length
            }}</b></span
          ><span
            >离线
            <b class="danger-text">{{
              room.devices.filter((id) => !store.devices.find((device) => device.id === id)?.online)
                .length
            }}</b></span
          >
        </div>
      </button>
    </section>
  </template>
  <template v-else>
    <button class="back-button" @click="backToList">
      <ArrowLeft :size="16" /> 返回 {{ selectedRoom.floor }}
    </button>
    <div class="breadcrumb">
      房间设备 / <b>{{ selectedRoom.floor }}</b> /
      <b>{{ selectedRoom.id }}（{{ selectedRoom.category }}）</b>
    </div>
    <SectionHeading :title="`${selectedRoom.id} 设备清单`" :icon="Cpu"
      ><template #default
        ><b class="count-tag"
          >{{ roomDevices.length }} 台设备 · 点击查看详情 / 控制 / OTA</b
        ></template
      ></SectionHeading
    >
    <section class="device-card-grid">
      <button
        v-for="device in roomDevices"
        :key="device.id"
        class="device-card"
        @click="store.openDevice(device)"
      >
        <div class="device-state">
          <i class="status-dot" :class="store.statusOf(device)"></i
          >{{ device.online ? '在线' : '离线' }}
        </div>
        <div class="device-card-head">
          <div class="device-icon">
            <component :is="store.deviceMeta[device.type].icon" :size="21" />
          </div>
          <div>
            <strong>{{ device.name }}</strong>
          </div>
        </div>
        <div class="device-params">
          <div v-for="param in deviceCardParams(device)" :key="param.label">
            <small>{{ param.label }}</small
            ><b>{{ param.value }}</b>
          </div>
        </div>
      </button>
    </section>
  </template>
</template>
