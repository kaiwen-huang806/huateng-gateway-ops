<script setup lang="ts">
import { Menu } from '@lucide/vue'
import { useRoute } from 'vue-router'
import { useGatewayStore } from '@/stores/gateway'

defineProps<{ mobileMenuOpen: boolean }>()
const emit = defineEmits<{ 'toggle-menu': [] }>()
const route = useRoute()
const store = useGatewayStore()
</script>

<template>
  <header class="topbar">
    <button class="icon-button menu-button" title="打开导航" @click="emit('toggle-menu')">
      <Menu :size="20" />
    </button>
    <div>
      <h1>{{ route.meta.title }}</h1>
      <p>{{ route.meta.subtitle }}</p>
    </div>
    <div class="topbar-status">
      <div class="top-stat"><span>网关 IP:PORT</span><b>192.168.1.10:8080</b></div>
      <div class="top-stat">
        <span>在线率</span
        ><b>{{ Math.round((store.onlineDevices / store.devices.length) * 100) }}%</b>
      </div>
      <div class="online-pill"><i class="status-dot ok"></i> 网关在线</div>
    </div>
  </header>
</template>
