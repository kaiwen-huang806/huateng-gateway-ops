<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  Check,
  Download,
  Edit3,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  X,
} from '@lucide/vue'
import { useGatewayStore } from '@/stores/gateway'
import type { Account, AccountPermission, AccountStatus } from '@/types/gateway'
import { currentAccount, DEMO_HOTEL_CODE } from '@/utils/auth'
import {
  accountApi,
  accountPermissionLabels,
  accountStatusLabels,
  type AccountInput,
} from '@/mock/accounts'

type AccountEditorInput = Omit<AccountInput, 'hotelCode'>

const store = useGatewayStore()
const accounts = ref<Account[]>([])
const loading = ref(true)
const saving = ref(false)
const keyword = ref('')
const permissionFilter = ref<AccountPermission | 'all'>('all')
const statusFilter = ref<AccountStatus | 'all'>('all')
const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const deletingAccount = ref<Account | null>(null)
const deletingAccounts = ref<Account[]>([])
const bulkMode = ref<'export' | 'delete' | null>(null)
const selectedIds = ref<Set<string>>(new Set())
const loggedInAccount = currentAccount()
const form = reactive<AccountEditorInput>({
  name: '',
  password: '12345',
  permission: 'after-sales',
  status: 'enabled',
})

const filteredAccounts = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return accounts.value.filter(
    (account) =>
      (!query || account.name.toLowerCase().includes(query) || account.id.includes(query)) &&
      (permissionFilter.value === 'all' || account.permission === permissionFilter.value) &&
      (statusFilter.value === 'all' || account.status === statusFilter.value),
  )
})

const selectedAccounts = computed(() =>
  accounts.value.filter((account) => selectedIds.value.has(account.id)),
)

const allVisibleSelected = computed(
  () =>
    filteredAccounts.value.length > 0 &&
    filteredAccounts.value.every((account) => selectedIds.value.has(account.id)),
)

const isEditingCurrentAccount = computed(() => {
  const account = accounts.value.find((item) => item.id === editingId.value)
  return account?.name === loggedInAccount
})

function isCurrentAccount(account: Account) {
  return account.name === loggedInAccount
}

function resetFilters() {
  keyword.value = ''
  permissionFilter.value = 'all'
  statusFilter.value = 'all'
}

function toggleBulkMode(mode: 'export' | 'delete') {
  if (bulkMode.value === mode && selectedAccounts.value.length) {
    if (mode === 'export') exportSelected()
    else requestBulkDelete()
    return
  }
  bulkMode.value = mode
  selectedIds.value = new Set()
}

function cancelBulkMode() {
  bulkMode.value = null
  selectedIds.value = new Set()
}

function toggleSelected(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleSelectAll() {
  const next = new Set(selectedIds.value)
  if (allVisibleSelected.value) {
    filteredAccounts.value.forEach((account) => next.delete(account.id))
  } else {
    filteredAccounts.value.forEach((account) => next.add(account.id))
  }
  selectedIds.value = next
}

function exportSelected() {
  if (!selectedAccounts.value.length) {
    store.notify('请先勾选要导出的账号', 'err')
    return
  }
  const header = ['编号', '名称', '权限', '状态', '创建时间']
  const rows = selectedAccounts.value.map((account) => [
    account.id,
    account.name,
    accountPermissionLabels[account.permission],
    accountStatusLabels[account.status],
    account.createdAt,
  ])
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = '账号列表.csv'
  link.click()
  URL.revokeObjectURL(url)
  store.notify(`已导出 ${selectedAccounts.value.length} 个账号`, 'ok')
  cancelBulkMode()
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.password = '12345'
  form.permission = 'after-sales'
  form.status = 'enabled'
  editorOpen.value = true
}

function openEdit(account: Account) {
  editingId.value = account.id
  form.name = account.name
  form.password = account.password
  form.permission = account.permission
  form.status = account.status
  editorOpen.value = true
}

function closeEditor() {
  if (!saving.value) editorOpen.value = false
}

async function saveAccount() {
  const name = form.name.trim()
  if (!name) {
    store.notify('请输入账号名称', 'err')
    return
  }
  if (!form.password) {
    store.notify('请输入登录密码', 'err')
    return
  }
  saving.value = true
  try {
    const current = editingId.value
      ? accounts.value.find((account) => account.id === editingId.value)
      : null
    const input = {
      name,
      password: form.password,
      hotelCode: current?.hotelCode ?? DEMO_HOTEL_CODE,
      permission: form.permission,
      status: isEditingCurrentAccount.value ? (current?.status ?? form.status) : form.status,
    }
    const saved = editingId.value
      ? await accountApi.update(editingId.value, input)
      : await accountApi.create(input)
    if (editingId.value) {
      const index = accounts.value.findIndex((account) => account.id === saved.id)
      if (index >= 0) accounts.value[index] = saved
    } else {
      accounts.value.unshift(saved)
    }
    editorOpen.value = false
    store.notify(editingId.value ? '账号信息已更新' : '账号已创建', 'ok')
  } catch (error) {
    store.notify(error instanceof Error ? error.message : '保存失败，请稍后重试', 'err')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(account: Account) {
  if (isCurrentAccount(account)) {
    store.notify('不能修改当前登录账号的状态', 'err')
    return
  }
  const nextStatus: AccountStatus = account.status === 'enabled' ? 'disabled' : 'enabled'
  const updated = await accountApi.update(account.id, {
    name: account.name,
    password: account.password,
    hotelCode: account.hotelCode,
    permission: account.permission,
    status: nextStatus,
  })
  Object.assign(account, updated)
  store.notify(`${account.name} 已${accountStatusLabels[nextStatus]}`, 'ok')
}

function requestDelete(account: Account) {
  deletingAccount.value = account
}

function requestBulkDelete() {
  deletingAccounts.value = [...selectedAccounts.value]
}

async function confirmDelete() {
  if (!deletingAccount.value) return
  const target = deletingAccount.value
  await accountApi.remove(target.id)
  accounts.value = accounts.value.filter((account) => account.id !== target.id)
  deletingAccount.value = null
  store.notify(`账号 ${target.name} 已删除`, 'ok')
}

async function confirmBulkDelete() {
  const targets = deletingAccounts.value
  await Promise.all(targets.map((account) => accountApi.remove(account.id)))
  const targetIds = new Set(targets.map((account) => account.id))
  accounts.value = accounts.value.filter((account) => !targetIds.has(account.id))
  deletingAccounts.value = []
  store.notify(`已删除 ${targets.length} 个账号`, 'ok')
  cancelBulkMode()
}

onMounted(async () => {
  accounts.value = await accountApi.list()
  loading.value = false
})
</script>

<template>
  <section class="accounts-view">
    <div class="toolbar account-toolbar">
      <label>
        账号名称
        <span class="account-search">
          <Search :size="15" />
          <input v-model="keyword" placeholder="搜索编号或名称" />
        </span>
      </label>
      <label>
        权限
        <select v-model="permissionFilter">
          <option value="all">全部权限</option>
          <option v-for="(label, value) in accountPermissionLabels" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
      <label>
        状态
        <select v-model="statusFilter">
          <option value="all">全部状态</option>
          <option v-for="(label, value) in accountStatusLabels" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
      <button class="ghost-button push-right" title="重置筛选" @click="resetFilters">
        <RotateCcw :size="15" /> 重置
      </button>
    </div>
    <div class="toolbar account-actions-toolbar">
      <button class="primary-button" @click="openCreate"><Plus :size="15" /> 新增账号</button>
      <button
        class="ghost-button"
        :class="{ 'bulk-active': bulkMode === 'export' }"
        @click="toggleBulkMode('export')"
      >
        <Download :size="15" /> {{ bulkMode === 'export' ? '导出已选' : '导出' }}
      </button>
      <button
        class="danger-button"
        :class="{ 'bulk-active': bulkMode === 'delete' }"
        @click="toggleBulkMode('delete')"
      >
        <Trash2 :size="15" /> {{ bulkMode === 'delete' ? '删除已选' : '删除' }}
      </button>
      <span v-if="bulkMode" class="bulk-hint push-right">
        已选 {{ selectedAccounts.length }} 个账号
      </span>
      <button v-if="bulkMode" class="ghost-button" @click="cancelBulkMode">
        <X :size="15" /> 取消选择
      </button>
    </div>

    <div class="panel table-panel account-table-panel">
      <div class="account-table-scroll">
        <table>
          <thead>
            <tr>
              <th v-if="bulkMode" class="selection-cell">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="全选当前账号"
                  @change="toggleSelectAll"
                />
              </th>
              <th>编号</th>
              <th>名称</th>
              <th>权限</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="bulkMode ? 7 : 6" class="empty-row">正在加载账号数据...</td>
            </tr>
            <tr
              v-for="account in filteredAccounts"
              :key="account.id"
              :class="{ 'current-account-row': isCurrentAccount(account) }"
            >
              <td v-if="bulkMode" class="selection-cell">
                <input
                  type="checkbox"
                  :checked="selectedIds.has(account.id)"
                  :aria-label="`选择账号 ${account.name}`"
                  @change="toggleSelected(account.id)"
                />
              </td>
              <td class="mono account-id">{{ account.id }}</td>
              <td>
                <div class="account-name">
                  <span class="account-avatar"><UserRound :size="15" /></span>
                  <strong>{{ account.name }}</strong>
                </div>
              </td>
              <td>
                <span class="permission-badge" :class="account.permission">
                  {{ accountPermissionLabels[account.permission] }}
                </span>
              </td>
              <td>
                <button
                  class="status-switch"
                  :class="{ on: account.status === 'enabled' }"
                  :disabled="isCurrentAccount(account)"
                  :aria-label="`${account.name} ${accountStatusLabels[account.status]}`"
                  :title="isCurrentAccount(account) ? '当前登录账号不能修改状态' : '切换账号状态'"
                  @click="toggleStatus(account)"
                >
                  <i></i><span>{{ accountStatusLabels[account.status] }}</span>
                </button>
              </td>
              <td class="mono muted-cell">{{ account.createdAt }}</td>
              <td>
                <div class="table-actions">
                  <button class="text-button" title="编辑账号" @click="openEdit(account)">
                    <Edit3 :size="14" /> 编辑
                  </button>
                  <button class="text-button danger-action" title="删除账号" @click="requestDelete(account)">
                    <Trash2 :size="14" /> 删除
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && !filteredAccounts.length">
              <td :colspan="bulkMode ? 7 : 6" class="empty-row">没有符合条件的账号</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="editorOpen" class="modal-backdrop confirm-backdrop" @click.self="closeEditor">
      <section class="confirm-dialog account-dialog">
        <header class="modal-header">
          <div class="device-icon large"><UserRound :size="22" /></div>
          <div>
            <h2>{{ editingId ? '编辑账号' : '新增账号' }}</h2>
            <p v-if="!editingId">创建后可在列表中继续维护</p>
          </div>
          <button class="icon-button" title="关闭" @click="closeEditor"><X :size="18" /></button>
        </header>
        <div class="confirm-body account-form">
          <label>
            <span>账号名称</span>
            <input v-model="form.name" placeholder="请输入账号名称" maxlength="32" />
          </label>
          <label>
            <span>登录密码</span>
            <input
              v-model="form.password"
              type="text"
              name="password"
              placeholder="请输入登录密码"
              autocomplete="off"
              maxlength="64"
            />
          </label>
          <label>
            <span>权限</span>
            <select v-model="form.permission">
              <option v-for="(label, value) in accountPermissionLabels" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </label>
          <label>
            <span>状态</span>
            <select v-model="form.status" :disabled="isEditingCurrentAccount">
              <option v-for="(label, value) in accountStatusLabels" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </label>
          <p v-if="isEditingCurrentAccount" class="account-self-note">
            当前登录账号不能修改自身状态。
          </p>
          <p class="confirm-text">
            当前为演示模式，密码用于本地登录校验；权限仅用于前端展示与交互。
          </p>
        </div>
        <footer class="confirm-footer">
          <button class="ghost-button" :disabled="saving" @click="closeEditor">取消</button>
          <button class="primary-button" :disabled="saving" @click="saveAccount">
            <Check :size="15" /> {{ saving ? '保存中...' : '保存账号' }}
          </button>
        </footer>
      </section>
    </div>

    <div
      v-if="deletingAccount"
      class="modal-backdrop confirm-backdrop"
      @click.self="deletingAccount = null"
    >
      <section class="confirm-dialog account-dialog">
        <header class="modal-header">
          <div class="device-icon large danger-icon"><Trash2 :size="22" /></div>
          <div>
            <h2>删除账号</h2>
            <p>{{ deletingAccount.name }}</p>
          </div>
        </header>
        <div class="confirm-body">
          <p class="confirm-text">删除后该账号将从当前列表移除，演示数据不会影响真实后端账号。</p>
        </div>
        <footer class="confirm-footer">
          <button class="ghost-button" @click="deletingAccount = null">取消</button>
          <button class="danger-button" @click="confirmDelete"><Trash2 :size="15" /> 确认删除</button>
        </footer>
      </section>
    </div>

    <div
      v-if="deletingAccounts.length"
      class="modal-backdrop confirm-backdrop"
      @click.self="deletingAccounts = []"
    >
      <section class="confirm-dialog account-dialog">
        <header class="modal-header">
          <div class="device-icon large danger-icon"><Trash2 :size="22" /></div>
          <div>
            <h2>批量删除账号</h2>
            <p>已选择 {{ deletingAccounts.length }} 个账号</p>
          </div>
        </header>
        <div class="confirm-body">
          <p class="confirm-text">
            确认删除已勾选的账号吗？删除后这些账号将从当前列表移除，演示数据不会影响真实后端账号。
          </p>
          <div class="bulk-delete-list">
            <span v-for="account in deletingAccounts" :key="account.id">{{ account.name }}</span>
          </div>
        </div>
        <footer class="confirm-footer">
          <button class="ghost-button" @click="deletingAccounts = []">取消</button>
          <button class="danger-button" @click="confirmBulkDelete">
            <Trash2 :size="15" /> 确认删除
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>
