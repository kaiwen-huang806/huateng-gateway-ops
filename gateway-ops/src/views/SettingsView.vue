<script setup lang="ts">
import { Activity, Globe2, LockKeyhole, LogOut, RefreshCw } from '@lucide/vue'
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGatewayStore } from '@/stores/gateway'
import SectionHeading from '@/components/common/SectionHeading.vue'
import { currentAccount, signOut } from '@/utils/auth'

const store = useGatewayStore()
const router = useRouter()

// 退出登录放在「访问与安全」里，和重启服务同属一类维护动作；
// 顶栏不做常驻按钮，避免日常误点。
const account = currentAccount()
// 账号缺失只可能是存储被清掉的极端情况，兜一句文案，别留空白。
const sessionText = account ? `已登录：${account} · 退出后需重新输入密码` : '退出后需重新输入密码'

const service = [
  ['监听地址', '本机网卡绑定 IP', '192.168.1.10'],
  ['Web 访问端口', '页面 IP:端口访问', ':8080'],
  ['网关版本', '当前运行版本', 'v2.4.1'],
  ['设备协议', '下行 / 上行通道', 'MQTT + Modbus-TCP'],
  ['运行时长', '自上次启动', '18d 06:42:10'],
  ['数据上报周期', '设备心跳 / 状态', '30s'],
]

const security = [
  ['登录认证', '售后运维账号', '已启用'],
  ['会话超时', '无操作自动登出', '30 min'],
  ['操作审计', '控制 / OTA 记录留痕', '开启'],
  ['日志保留', '本地循环存储', '90 天'],
  ['OTA 校验', '固件签名校验', '强制'],
]

// 退出是会话级动作：点到就得重新输密码，所以先弹一层确认，不直接清会话。
const confirmingLogout = ref(false)
const cancelButton = ref<HTMLButtonElement | null>(null)

// 默认焦点落在「取消」：误退出的代价比多点一次大。
async function requestLogout() {
  confirmingLogout.value = true
  await nextTick()
  cancelButton.value?.focus()
}

// 清会话 + 回登录页即可：守卫查不到会话后，会把之后任何业务页都拦回登录页，
// 所以这里不需要逐个页面去清状态。
function confirmLogout() {
  confirmingLogout.value = false
  signOut()
  router.replace({ name: 'login' })
}
</script>

<template>
  <section class="settings-grid">
    <div class="panel settings-panel">
      <SectionHeading title="网关服务" :icon="Globe2" />
      <div v-for="item in service" :key="item[0]" class="setting-row">
        <div>
          <b>{{ item[0] }}</b
          ><span>{{ item[1] }}</span>
        </div>
        <code>{{ item[2] }}</code>
      </div>
    </div>
    <div class="panel settings-panel">
      <SectionHeading title="访问与安全" :icon="LockKeyhole" />
      <div v-for="item in security" :key="item[0]" class="setting-row">
        <div>
          <b>{{ item[0] }}</b
          ><span>{{ item[1] }}</span>
        </div>
        <code>{{ item[2] }}</code>
      </div>
      <div class="setting-row">
        <div>
          <b>当前会话</b><span>{{ sessionText }}</span>
        </div>
        <button class="ghost-button" title="退出登录" @click="requestLogout">
          <LogOut :size="15" /> 退出登录
        </button>
      </div>
      <div class="setting-row">
        <div><b>维护操作</b><span>重启网关服务</span></div>
        <button class="danger-button" @click="store.notify('演示模式：重启服务操作已禁用', 'err')">
          <RefreshCw :size="15" /> 重启服务
        </button>
      </div>
    </div>
  </section>
  <section class="panel">
    <SectionHeading title="接入统计" :icon="Activity" />
    <div class="stats-grid">
      <div>
        <small>接入楼层</small><b>{{ store.floors.length }}</b>
      </div>
      <div>
        <small>房间总数</small><b>{{ store.rooms.length }}</b>
      </div>
      <div>
        <small>设备总数</small><b>{{ store.devices.length }}</b>
      </div>
      <div>
        <small>设备类型</small><b>{{ Object.keys(store.deviceMeta).length }}</b>
      </div>
    </div>
  </section>

  <!-- 退出登录的二次确认：单独做根节点，别塞进 .settings-grid —— 遮罩是
       position: fixed，挂在网格里会被设置卡的布局带着跑。 -->
  <div
    v-if="confirmingLogout"
    class="modal-backdrop confirm-backdrop"
    @click.self="confirmingLogout = false"
  >
    <section class="confirm-dialog">
      <header class="modal-header">
        <div class="device-icon large"><LogOut :size="22" /></div>
        <div>
          <h2>退出登录</h2>
          <p>{{ account ? `当前账号 ${account}` : '当前账号未记录' }}</p>
        </div>
      </header>
      <div class="confirm-body">
        <p class="confirm-text">
          退出后立刻回到登录页，运维台各业务页都会重新被拦回登录，需要重新输入账号密码才能进来。
        </p>
      </div>
      <footer class="confirm-footer">
        <button ref="cancelButton" class="ghost-button" @click="confirmingLogout = false">
          取消
        </button>
        <button class="primary-button" @click="confirmLogout">确认退出</button>
      </footer>
    </section>
  </div>
</template>
