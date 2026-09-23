import { createRouter, createWebHashHistory } from 'vue-router'
import { isAuthenticated } from '@/utils/auth'

// 路由元信息用于顶栏标题，集中在这里维护，避免和视图列表重复定义。
declare module 'vue-router' {
  interface RouteMeta {
    title: string
    subtitle: string
    // 公开路由：整屏渲染，不套运维台外壳（侧边栏 / 顶栏）。
    public?: boolean
  }
}

// 使用 hash 模式：网关设备以静态文件方式对外提供服务，history 模式在刷新子路径时
// 需要服务端 rewrite 回 index.html，hash 模式则任何静态服务器都能直接工作。
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: { name: 'overview' } },
    {
      // 登录页独立整屏，不套应用外壳，所以 meta.public 必须为 true。
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: '登录', subtitle: '华腾智能本地客控系统', public: true },
    },
    {
      path: '/overview',
      name: 'overview',
      component: () => import('@/views/OverviewView.vue'),
      meta: { title: '态势概览', subtitle: '酒店设备网关 · 全局运行态势' },
    },
    {
      // roomId 可选：/rooms 为楼层房间列表，/rooms/803 为单个房间的设备清单。
      path: '/rooms/:roomId?',
      name: 'rooms',
      component: () => import('@/views/RoomsView.vue'),
      meta: { title: '房间设备', subtitle: '分楼层 / 分房间查看设备状态与下发控制' },
    },
    {
      path: '/ota',
      name: 'ota',
      component: () => import('@/views/OtaView.vue'),
      meta: { title: 'OTA 升级中心', subtitle: '批量或单设备固件升级管理' },
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('@/views/LogsView.vue'),
      meta: { title: '日志中心', subtitle: '每台设备最新日志 · 可按日期回溯历史' },
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: () => import('@/views/AccountsView.vue'),
      meta: { title: '账号管理中心', subtitle: '维护账号、权限范围与访问状态' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { title: '系统设置', subtitle: '网关服务与访问配置' },
    },
  ],
})

// ── 登录守卫 ──────────────────────────────────────────────
// 「输网址 → 跳登录页」是前端的职责，不是后端的：这个网关以静态文件形式对外提供
// 页面，服务端没有 history rewrite，也没法替我们把 URL 改写到登录页；后端只负责
// POST /api/auth/login 校验账号密码，页面之间的跳转始终归前端路由管。
//
// 规则：白名单（meta.public）直接放行，其余一律要求会话；并把原目标挂在 redirect 上，
// 登录成功后回到用户本来想看的那一页，而不是每次都丢回态势概览。
router.beforeEach((to) => {
  const authed = isAuthenticated()

  if (!to.meta.public) {
    if (authed) return true
    // 概览就是登录后的默认落点（根路径也会被重定向到这里），这类目标不必带
    // redirect，免得地址栏上挂一串没人看的参数。
    const query = to.name === 'overview' ? {} : { redirect: to.fullPath }
    return { name: 'login', query, replace: true }
  }

  // 已登录还去登录页：直接送进运维台，避免出现「登录了一半」的中间态。
  if (to.name === 'login' && authed) {
    const target = typeof to.query.redirect === 'string' ? to.query.redirect : ''
    const resolved = target ? router.resolve(target) : null
    // 解析不出来、或目标本身就是登录页时不能再跳回去，否则会绕成死循环。
    if (resolved?.name && resolved.name !== 'login') {
      return { path: resolved.fullPath, replace: true }
    }
    return { name: 'overview', replace: true }
  }

  return true
})

export default router
