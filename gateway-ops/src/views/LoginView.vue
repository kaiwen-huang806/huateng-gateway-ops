<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Building2, Eye, EyeOff, LoaderCircle, Lock, User } from '@lucide/vue'
import LoginIllustration from '@/components/login/LoginIllustration.vue'
import { authenticate } from '@/utils/auth'

const router = useRouter()
const route = useRoute()

const account = ref('')
const password = ref('')
const hotelCode = ref('')
const showPassword = ref(false)
const capsLockOn = ref(false)
const submitting = ref(false)
const error = ref('')

// 只做空值与防重复提交。密码是否正确一律由网关判定，前端不猜——
// 否则前端出现的结论、和网关实际拒绝的原因会对不上。
function submit() {
  if (submitting.value) return
  if (!account.value.trim()) {
    error.value = '请输入账号'
    return
  }
  if (!password.value) {
    error.value = '请输入登录密码'
    return
  }
  if (!hotelCode.value) {
    error.value = '请输入酒店编码'
    return
  }
  if (!/^\d{7}$/.test(hotelCode.value)) {
    error.value = '酒店编码必须为7位数字'
    return
  }
  error.value = ''
  submitting.value = true

  // TODO 接网关：把 authenticate() 换成 POST /api/auth/login，成功后写入会话，
  // 失败按网关返回的错误码给文案（「认证信息错误」与「网关不可达」必须分开提示，
  // 现场排查时才不会被误导）。演示账号见 utils/auth.ts。
  window.setTimeout(() => {
    submitting.value = false
    if (!authenticate(account.value, password.value, hotelCode.value)) {
      error.value = '账号、密码或酒店编码错误'
      return
    }
    // replace 而不是 push：登录页不该留在历史里，免得在运维台按返回又弹回来。
    router.replace(redirectTarget())
  }, 600)
}

// 登录成功后回到被守卫拦下来的那一页；直接打开登录页时没有 redirect，就去态势概览。
function redirectTarget() {
  const raw = route.query.redirect
  const resolved = typeof raw === 'string' ? router.resolve(raw) : null
  // 解析不出来、或目标本身就是登录页时退回概览，否则会在登录页原地打转。
  if (resolved?.name && resolved.name !== 'login') return resolved.fullPath
  return { name: 'overview' }
}

// 大写锁定是密码输入最常见的"看起来没输错却登不上"，提前提示掉。
function syncCapsLock(event: KeyboardEvent) {
  capsLockOn.value = event.getModifierState?.('CapsLock') ?? false
}

function normalizeHotelCode(event: Event) {
  const input = event.target as HTMLInputElement | null
  const normalized = input?.value.replace(/\D/g, '').slice(0, 7) ?? ''
  hotelCode.value = normalized
  if (input) input.value = normalized
}
</script>

<template>
  <div class="login-page">
    <LoginIllustration />
    <div class="login-veil"></div>

    <main class="login-card">
      <h1 class="login-title">华腾智能本地客控系统</h1>
      <p class="login-subtitle">酒店客房智能网关 · 运维端</p>

      <form class="login-form" novalidate @submit.prevent="submit">
        <label class="login-field">
          <User class="login-field-icon" :size="18" />
          <input
            v-model.trim="account"
            type="text"
            name="account"
            placeholder="请输入账号"
            autocomplete="username"
            autofocus
            @keydown="syncCapsLock"
            @keyup="syncCapsLock"
          />
        </label>

        <label class="login-field">
          <Lock class="login-field-icon" :size="18" />
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            name="password"
            placeholder="请输入登录密码"
            autocomplete="current-password"
            @keydown="syncCapsLock"
            @keyup="syncCapsLock"
          />
          <button
            type="button"
            class="login-eye"
            :title="showPassword ? '隐藏密码' : '显示密码'"
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            @click="showPassword = !showPassword"
          >
            <EyeOff v-if="showPassword" :size="18" />
            <Eye v-else :size="18" />
          </button>
        </label>

        <label class="login-field">
          <Building2 class="login-field-icon" :size="18" />
          <input
            v-model="hotelCode"
            type="text"
            name="hotelCode"
            placeholder="请输入7位酒店编码"
            autocomplete="off"
            inputmode="numeric"
            maxlength="7"
            pattern="[0-9]{7}"
            @input="normalizeHotelCode"
          />
        </label>

        <!-- 固定高度：报错时只换内容，卡片不会被撑高导致按钮跳动 -->
        <div class="login-messages">
          <p v-if="error" class="login-error">{{ error }}</p>
          <p v-else-if="capsLockOn" class="login-caps">大写锁定已开启</p>
        </div>

        <button class="login-submit" type="submit" :disabled="submitting">
          <LoaderCircle v-if="submitting" class="login-spinner" :size="18" />
          <span>{{ submitting ? '登录中' : '登录' }}</span>
        </button>
      </form>

      <p class="login-foot">© 2026 华腾智能 · 本地客控系统 v2.4.1</p>
    </main>
  </div>
</template>
