<script setup lang="ts">
import { CircleAlert, FileUp, Upload, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useGatewayStore } from '@/stores/gateway'
import type { Device, UpgradeKind } from '@/types/gateway'

const store = useGatewayStore()

const targets = computed(() => store.pendingUpgrade)
const single = computed(() => (targets.value.length === 1 ? targets.value[0]! : null))
const rooms = computed(() => [...new Set(targets.value.map((device) => device.room))])
// 批量批次只允许同类型设备，这里仍按集合取标签，混类型时也能如实展示。
const typeLabels = computed(() => [
  ...new Set(targets.value.map((device) => store.deviceMeta[device.type].label)),
])
// 弹窗只负责选固件，升级范围在标题里交代清楚。
const scope = computed(() =>
  single.value
    ? `${single.value.room} · ${single.value.name} · 当前 ${single.value.firmware}`
    : `本次共 ${targets.value.length} 台${typeLabels.value.join('、')} · 涉及 ${rooms.value.length} 个房间`,
)

const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const downgradeConfirmed = ref(false)

// 版本取文件名里的 x.y.z。不连云时没有别处能提供目标版本，解析不到就直接拦住，
// 而不是猜一个版本号——猜错比拒绝提交危险得多。
const versionFromName = computed(() => file.value?.name.match(/\d+(?:\.\d+)+/)?.[0] ?? '')
const targetVersion = computed(() => (versionFromName.value ? `v${versionFromName.value}` : ''))
const missingVersion = computed(() => Boolean(file.value) && !versionFromName.value)
// 选了固件之后才知道目标版本，此时按设备当前固件把这一批分成升级 / 重刷 / 降级。
const kinds = computed(() => {
  const buckets: Record<UpgradeKind, Device[]> = { upgrade: [], reflash: [], downgrade: [] }
  if (!targetVersion.value) return buckets
  targets.value.forEach((device) =>
    buckets[store.upgradeKind(device, targetVersion.value)].push(device),
  )
  return buckets
})
const summary = computed(() => {
  if (!targetVersion.value) return ''
  const parts: string[] = []
  if (kinds.value.upgrade.length) parts.push(`${kinds.value.upgrade.length} 台升级`)
  if (kinds.value.reflash.length) parts.push(`${kinds.value.reflash.length} 台同版本覆盖重刷`)
  if (kinds.value.downgrade.length) parts.push(`${kinds.value.downgrade.length} 台降级`)
  return parts.join('、')
})
// 降级不可逆，必须由人显式确认后才能提交。
const needDowngradeConfirm = computed(
  () => kinds.value.downgrade.length > 0 && !downgradeConfirmed.value,
)
// 目标版本读不出来、或降级尚未确认时，都不允许下发。
const submitBlocked = computed(() => missingVersion.value || needDowngradeConfirm.value)

// 关掉弹窗时清空表单，避免下次打开还挂着上一次选的固件。
watch(targets, (list) => {
  if (list.length) return
  file.value = null
  downgradeConfirmed.value = false
})

function pickFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
  // 换文件等于换目标版本，降级确认作废。
  downgradeConfirmed.value = false
}

function confirm() {
  const picked = file.value
  if (!picked) {
    store.notify('请先选择本地固件文件', 'err')
    return
  }
  if (missingVersion.value) {
    store.notify('文件名里没有版本号，无法确定目标版本', 'err')
    return
  }
  if (needDowngradeConfirm.value) {
    store.notify('本次包含降级，请先确认降级风险', 'err')
    return
  }
  // 固件名称取文件名去掉扩展名；版本取文件名里的 x.y.z（上面已拦掉解析不到的情况）。
  store.confirmUpgrade({
    name: picked.name.replace(/\.[^.]+$/, ''),
    fileName: picked.name,
    version: targetVersion.value,
  })
}
</script>

<template>
  <div
    v-if="targets.length"
    class="modal-backdrop confirm-backdrop"
    @click.self="store.dismissUpgrade()"
  >
    <section class="confirm-dialog">
      <header class="modal-header">
        <div class="device-icon large"><Upload :size="22" /></div>
        <div>
          <h2>上传固件升级</h2>
          <p>{{ scope }}</p>
        </div>
        <button class="icon-button" title="关闭" @click="store.dismissUpgrade()">
          <X :size="20" />
        </button>
      </header>
      <div class="confirm-body">
        <div class="firmware-field">
          <small>上传固件</small>
          <div class="upload-picker">
            <button class="ghost-button" type="button" @click="fileInput?.click()">
              <FileUp :size="15" /> 选择文件
            </button>
            <span class="file-name" :class="{ chosen: file }">{{
              file?.name ?? '未选择文件'
            }}</span>
            <input
              ref="fileInput"
              type="file"
              accept=".bin,.zip,.img,.fw"
              hidden
              @change="pickFile"
            />
          </div>
        </div>
        <p v-if="missingVersion" class="firmware-summary danger-text">
          <CircleAlert :size="14" />文件名里没有版本号，无法确定目标版本。请把固件包命名成含版本号的
          形式，例如 2035网关固件V2.5.0.bin。
        </p>
        <p v-else-if="file" class="firmware-summary">
          目标版本 <b>{{ targetVersion }}</b
          ><template v-if="summary"> · 本次 {{ summary }}</template>
        </p>
        <label v-if="kinds.downgrade.length" class="downgrade-confirm">
          <input v-model="downgradeConfirmed" type="checkbox" />
          <span
            >我已知晓：本次会把 {{ kinds.downgrade.length }} 台设备降级到
            {{ targetVersion }}，请确认执行</span
          >
        </label>
        <p class="confirm-warning">
          <CircleAlert :size="14" />切勿上传错误固件，否则所有设备将变砖！
        </p>
      </div>
      <footer class="confirm-footer">
        <button class="ghost-button" @click="store.dismissUpgrade()">取消</button>
        <button class="primary-button" :disabled="submitBlocked" @click="confirm">确定</button>
      </footer>
    </section>
  </div>
</template>
