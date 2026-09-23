<script setup lang="ts">
import { Activity, Bell, Building2, CircleAlert, Cpu, Gauge, Wifi, WifiOff } from '@lucide/vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGatewayStore } from '@/stores/gateway'
import SectionHeading from '@/components/common/SectionHeading.vue'
import type { RoomStatus } from '@/types/gateway'

const router = useRouter()
const store = useGatewayStore()
const onlineRate = computed(() =>
  store.devices.length ? Math.round((store.onlineDevices / store.devices.length) * 100) : 0,
)
const roomCategories = computed(() =>
  [...new Set(store.rooms.map((room) => room.category))].join(' / '),
)
const roomStatusMeta: Record<RoomStatus, { label: string; className: string }> = {
  occupied: { label: '入住', className: 'occupied' },
  cleaning: { label: '清理', className: 'cleaning' },
  'do-not-disturb': { label: '勿扰', className: 'do-not-disturb' },
  vacant: { label: '空房', className: 'vacant' },
  unoccupied: { label: '未入住', className: 'unoccupied' },
  fault: { label: '故障房', className: 'fault' },
}
const floorSummaries = computed(() =>
  store.floors.map((floor) => {
    const rooms = store.rooms.filter((room) => room.floor === floor)
    const devices = store.devices.filter((device) => device.floor === floor)

    return {
      floor,
      category: rooms[0]?.category ?? '未分类',
      rooms,
      onlineDevices: devices.filter((device) => device.online).length,
      deviceCount: devices.length,
    }
  }),
)

function roomStatus(roomId: string) {
  const room = store.rooms.find((item) => item.id === roomId)
  return store.statusOf(store.devices.find((device) => device.id === room?.devices[0]))
}

function roomStatusMetaOf(status: RoomStatus) {
  return roomStatusMeta[status]
}
</script>

<template>
  <section class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label"><Building2 :size="16" /> 接入楼层</div>
      <strong>{{ store.floors.length }}</strong
      ><span>客房楼层全覆盖</span><Building2 class="kpi-watermark" :size="36" />
    </div>
    <div class="kpi-card">
      <div class="kpi-label"><Building2 :size="16" /> 房间总数</div>
      <strong>{{ store.rooms.length }}</strong
      ><span>{{ roomCategories || '暂无房型' }}</span
      ><Building2 class="kpi-watermark" :size="36" />
    </div>
    <div class="kpi-card">
      <div class="kpi-label"><Cpu :size="16" /> 设备总数</div>
      <strong>{{ store.devices.length }}</strong
      ><span>{{ Object.keys(store.deviceMeta).length }} 类智能设备</span
      ><Cpu class="kpi-watermark" :size="36" />
    </div>
    <div class="kpi-card">
      <div class="kpi-label"><Activity :size="16" /> 在线 / 离线</div>
      <strong class="success-text"
        >{{ store.onlineDevices }}
        <small>/ {{ store.devices.length - store.onlineDevices }}</small></strong
      ><span>在线率 {{ onlineRate }}%</span><Gauge class="kpi-watermark" :size="36" />
    </div>
    <div class="kpi-card">
      <div class="kpi-label"><CircleAlert :size="16" /> 异常 / 注意</div>
      <strong class="danger-text"
        >{{ store.devices.filter((device) => !device.online).length }}
        <small
          >/ {{ store.devices.filter((device) => store.statusOf(device) === 'warn').length }}</small
        ></strong
      ><span>需要售后关注</span><Bell class="kpi-watermark" :size="36" />
    </div>
  </section>

  <SectionHeading
    title="楼层房间态势"
    :icon="Building2"
    action="点击房间进入设备视图"
    @action="router.push({ name: 'rooms' })"
  />
  <section class="floor-grid">
    <article v-for="summary in floorSummaries" :key="summary.floor" class="panel floor-panel">
      <div class="panel-heading">
        <h3>{{ summary.floor }} {{ summary.category }}</h3>
        <small
          >{{ summary.rooms.length }} 间 · 在线 {{ summary.onlineDevices }}/{{
            summary.deviceCount
          }}</small
        >
      </div>
      <div class="room-status-grid">
        <button
          v-for="room in summary.rooms"
          :key="room.id"
          class="room-status-cell"
          :class="roomStatus(room.id)"
          :aria-label="`${room.id} ${roomStatusMetaOf(room.status).label}，网关${room.gatewayOnline ? '在线' : '离线'}`"
          @click="router.push({ name: 'rooms', params: { roomId: room.id } })"
        >
          <div class="room-status-head">
            <b>{{ room.id }}</b>
            <component
              :is="room.gatewayOnline ? Wifi : WifiOff"
              class="gateway-icon"
              :class="room.gatewayOnline ? 'online' : 'offline'"
              :size="14"
              :title="room.gatewayOnline ? '网关在线' : '网关离线'"
            />
          </div>
          <span
            class="room-state"
            :class="roomStatusMetaOf(room.status).className"
            :title="roomStatusMetaOf(room.status).label"
            >{{ roomStatusMetaOf(room.status).label }}</span
          >
        </button>
      </div>
    </article>
  </section>

  <section class="overview-lower">
    <div class="panel">
      <SectionHeading title="设备类型分布" :icon="Cpu" />
      <div class="distribution">
        <div v-for="(meta, type) in store.deviceMeta" :key="type" class="distribution-row">
          <span><component :is="meta.icon" :size="15" /> {{ meta.label }}</span>
          <div class="distribution-bar">
            <i
              :style="{
                width: `${(store.devices.filter((device) => device.type === type).length / store.devices.length) * 100}%`,
              }"
            ></i>
          </div>
          <b>{{ store.devices.filter((device) => device.type === type).length }}</b>
        </div>
      </div>
    </div>
    <div class="panel">
      <SectionHeading
        title="最新告警"
        :icon="Bell"
        action="查看全部"
        @action="router.push({ name: 'logs' })"
      />
      <div class="alert-list">
        <div
          v-for="log in store.alertLogs.slice(0, 5)"
          :key="`${log.room}-${log.time}-${log.message}`"
          class="alert-row"
        >
          <b class="level" :class="log.level">{{ log.level }}</b
          ><time>{{ log.time }}</time
          ><span>{{ log.room }} · {{ log.message }}</span>
        </div>
        <div v-if="!store.alertLogs.length" class="alert-empty">暂无异常告警</div>
      </div>
    </div>
  </section>
</template>
