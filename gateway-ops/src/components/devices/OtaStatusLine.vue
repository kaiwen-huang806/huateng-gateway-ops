<script setup lang="ts">
import { Check, CircleAlert, Clock, Ban } from '@lucide/vue'
import { useGatewayStore } from '@/stores/gateway'
import type { Device } from '@/types/gateway'

// OTA 列表行与批量面板行共用的状态行：进行中 / 排队 / 失败 / 停止 / 成功。
// 抽出来是为了两处文案和交互只维护一份，改一处不会漏另一处。
defineProps<{ device: Device }>()

const store = useGatewayStore()
</script>

<template>
  <div v-if="store.otaBusy(device)" class="progress-wrap">
    <i :style="{ width: `${device.progress}%` }"></i>
    <small>{{ store.otaStageText(device) }}</small>
  </div>
  <div v-else-if="device.otaStatus === 'queued'" class="ota-waiting">
    <Clock :size="14" />等待下发…（前方设备占用升级通道）
  </div>
  <div v-else-if="device.otaStatus === 'stopped'" class="ota-waiting">
    <Ban :size="14" />已停止下发
    <button class="text-button" @click="store.retryUpgrade(device)">重新下发</button>
  </div>
  <!-- 失败是持久状态：一直留在行内，直到重试成功或用户重新升级。 -->
  <div v-else-if="device.otaStatus === 'failed'" class="ota-failed">
    <div class="ota-failed-text">
      <CircleAlert :size="14" />升级失败 · {{ device.otaError?.message }}
    </div>
    <button class="text-button" @click="store.retryUpgrade(device)">重试</button>
    <button class="text-button" @click="store.openDeviceOta(device)">详情</button>
  </div>
  <div v-else-if="device.otaStatus === 'success'" class="ota-success">
    <Check :size="14" />已升级至 {{ device.firmware }} · {{ device.otaUpdatedAt }}
  </div>
</template>
