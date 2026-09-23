import type {
  Account,
  AccountPermission,
  AccountStatus,
} from '@/types/gateway'

export type AccountInput = Pick<Account, 'name' | 'password' | 'hotelCode' | 'permission' | 'status'>

// 演示数据只负责提供一个稳定的前端数据源；接入后端时保留 Account 字段形状即可。
const demoAccounts: Account[] = [
  { id: '1001', name: 'admin', password: '12345', hotelCode: '1111111', permission: 'management', status: 'enabled', createdAt: '2026-03-18 09:20:11' },
  { id: '1002', name: 'after-sales-01', password: '12345', hotelCode: '1111111', permission: 'after-sales', status: 'enabled', createdAt: '2026-03-20 14:06:32' },
  { id: '1003', name: 'after-sales-02', password: '12345', hotelCode: '1111111', permission: 'after-sales', status: 'disabled', createdAt: '2026-03-24 10:42:18' },
  { id: '1004', name: 'rd-core', password: '12345', hotelCode: '1111111', permission: 'research', status: 'enabled', createdAt: '2026-04-02 16:35:07' },
  { id: '1005', name: 'engineering-01', password: '12345', hotelCode: '1111111', permission: 'engineering', status: 'enabled', createdAt: '2026-04-09 11:18:45' },
  { id: '1006', name: 'engineering-02', password: '12345', hotelCode: '1111111', permission: 'engineering', status: 'enabled', createdAt: '2026-04-16 08:55:29' },
  { id: '1007', name: 'viewer-demo', password: '12345', hotelCode: '1111111', permission: 'research', status: 'disabled', createdAt: '2026-05-01 13:27:04' },
]

let accounts = structuredClone(demoAccounts)

function cloneAccount(account: Account) {
  return { ...account }
}

export function findAccount(name: string) {
  return accounts.find((account) => account.name === name) ?? null
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), 120))
}

export const mockAccountApi = {
  list(): Promise<Account[]> {
    return delay(accounts.map(cloneAccount))
  },

  create(input: AccountInput): Promise<Account> {
    const nextId = String(Math.max(...accounts.map((account) => Number(account.id)), 1000) + 1)
    const account: Account = {
      id: nextId,
      ...input,
      createdAt: formatDate(new Date()),
    }
    accounts = [account, ...accounts]
    return delay(cloneAccount(account))
  },

  update(id: string, input: AccountInput): Promise<Account> {
    const index = accounts.findIndex((account) => account.id === id)
    const current = accounts[index]
    if (!current) return Promise.reject(new Error('账号不存在'))
    const account: Account = { ...current, ...input }
    accounts[index] = account
    return delay(cloneAccount(account))
  },

  remove(id: string): Promise<void> {
    accounts = accounts.filter((account) => account.id !== id)
    return delay(undefined)
  },
}

function formatDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// 对接后端时替换此导出，不影响账号管理页面的交互和数据流。
export const accountApi = mockAccountApi

export const accountPermissionLabels: Record<AccountPermission, string> = {
  'after-sales': '售后',
  research: '研发',
  engineering: '工程',
  management: '管理',
}

export const accountStatusLabels: Record<AccountStatus, string> = {
  enabled: '启用',
  disabled: '停用',
}
