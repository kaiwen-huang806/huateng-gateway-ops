<script setup lang="ts">
import { ArrowLeft, Building2, Cpu } from '@lucide/vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGatewayStore } from '@/stores/gateway'
import type { Room } from '@/types/gateway'
import SectionHeading from '@/components/common/SectionHeading.vue'

const route = useRoute()
const router = useRouter()
const store = useGatewayStore()

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
            <strong>{{ device.name }}</strong
            ><span>{{ store.deviceMeta[device.type].label }}</span>
          </div>
        </div>
        <div class="device-params">
          <div>
            <small>固件版本</small><b>{{ device.firmware }}</b>
          </div>
          <div><small>最近心跳</small><b>刚刚</b></div>
        </div>
      </button>
    </section>
  </template>
</template>
