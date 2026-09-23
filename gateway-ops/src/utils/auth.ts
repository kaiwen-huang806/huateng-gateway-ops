// 登录态的唯一来源：守卫、登录页、顶栏退出都只从这里读写，避免各处各存一份。
//
// 现在跑的是演示用的假登录（见账号管理中心的演示数据）。接网关时只要把
// authenticate() 换成 POST /api/auth/login，其余代码都不用动：
// 守卫仍然问「有没有会话」，登录页仍然问「这次认证成没成功」。
//
// 为什么用 localStorage 而不是 sessionStorage：运维端在网管电脑上通常是常驻标签页，
// 刷新、关标签后重开都不应该被踢回登录页。
import { findAccount } from '@/mock/accounts'

const SESSION_KEY = 'huateng.ops.session'

// 演示账号（假数据，仅用于本地演示）。
export const DEMO_ACCOUNT = 'admin'
export const DEMO_PASSWORD = '12345'
export const DEMO_HOTEL_CODE = '1111111'

export interface LoginSession {
  account: string
  loginAt: string
}

// 无痕模式 / 策略禁用下访问 localStorage 会直接抛异常，这里统一兜住：
// 存不下就退化成「本次内存内有效」，不因为写不了存储把人一直卡在登录页。
function sessionStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    // 取不到就交给下面的内存兜底
    return null
  }
}

let memorySession: LoginSession | null = null

export function readSession(): LoginSession | null {
  if (memorySession) return memorySession
  try {
    const raw = sessionStorage()?.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LoginSession> | null
    if (!parsed || typeof parsed.account !== 'string' || !parsed.account) return null
    memorySession = { account: parsed.account, loginAt: parsed.loginAt ?? '' }
    return memorySession
  } catch {
    // 存储里是脏数据就当作未登录，不要让它把整个应用带崩
    return null
  }
}

export function isAuthenticated() {
  return readSession() !== null
}

export function currentAccount() {
  return readSession()?.account ?? ''
}

// 假登录：账号、密码、酒店编码三项必须同时匹配，且账号必须处于启用状态。
// 接网关后这里改成：拿到 200 再写入会话，401 返回 false，网络异常抛出去单独提示
//（「认证信息错误」和「网关不可达」必须分开，现场排查时才不会被误导）。
export function authenticate(account: string, password: string, hotelCode: string) {
  const name = account.trim()
  const code = hotelCode.trim()
  const matched = findAccount(name)
  if (!matched || matched.status !== 'enabled' || matched.password !== password) {
    return false
  }
  if (!/^\d{7}$/.test(code) || matched.hotelCode !== code) {
    return false
  }

  const session: LoginSession = { account: name, loginAt: new Date().toISOString() }
  memorySession = session
  try {
    sessionStorage()?.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // 写不进去也不影响本次登录，退化成内存会话
  }
  return true
}

export function signOut() {
  memorySession = null
  try {
    sessionStorage()?.removeItem(SESSION_KEY)
  } catch {
    // 清不掉也无所谓，内存里已经登出
  }
}
