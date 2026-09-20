<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, CircleAlert } from '@lucide/vue'
import { RouterView, useRoute } from 'vue-router'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import DeviceModal from '@/components/devices/DeviceModal.vue'
import UpgradeDialog from '@/components/devices/UpgradeDialog.vue'
import { useGatewayStore } from '@/stores/gateway'

const store = useGatewayStore()
const route = useRoute()
const mobileMenuOpen = ref(false)
// 登录页属公开路由：整屏铺满，不套侧边栏 / 顶栏外壳。
const isPublicView = computed(() => route.meta.public === true)
</script>

<template>
  <RouterView v-if="isPublicView" />
  <div v-else class="app-shell">
    <AppSidebar :mobile-menu-open="mobileMenuOpen" @close-menu="mobileMenuOpen = false" />
    <section class="main-area">
      <AppTopbar
        :mobile-menu-open="mobileMenuOpen"
        @toggle-menu="mobileMenuOpen = !mobileMenuOpen"
      />
      <main class="content"><RouterView /></main>
    </section>
    <DeviceModal />
    <UpgradeDialog />
    <transition name="toast"
      ><div v-if="store.toastMessage" class="toast-message" :class="store.toastKind">
        <Check v-if="store.toastKind === 'ok'" :size="16" /><CircleAlert v-else :size="16" />{{
          store.toastMessage
        }}
      </div></transition
    >
  </div>
</template>
