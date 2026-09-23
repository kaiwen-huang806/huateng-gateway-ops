import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import router from '../router'
import App from '../App.vue'
import {
  DEMO_ACCOUNT,
  DEMO_HOTEL_CODE,
  DEMO_PASSWORD,
  authenticate,
  isAuthenticated,
  signOut,
} from '../utils/auth'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function mountAt(path: string) {
  await router.push(path)
  await router.isReady()
  return mount(App, { global: { plugins: [createPinia(), router] } })
}

// 登录态存在 localStorage 里，会跨用例残留；每个用例都从「未登录」开始。
beforeEach(() => {
  signOut()
})

describe('登录页', () => {
  it('作为公开路由整屏渲染，不套运维台外壳', async () => {
    const wrapper = await mountAt('/login')

    expect(wrapper.find('.login-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('华腾智能本地客控系统')
    // 背景插画在，侧边栏 / 顶栏属于登录后的外壳，登录页不该出现。
    expect(wrapper.find('.login-scene').exists()).toBe(true)
    expect(wrapper.find('.sidebar').exists()).toBe(false)
    expect(wrapper.find('.topbar').exists()).toBe(false)
  })

  it('账号、密码与酒店编码三个下划线输入框齐备，密码默认隐藏且可切换', async () => {
    const wrapper = await mountAt('/login')
    const inputs = wrapper.findAll('.login-field input')

    expect(inputs.map((input) => input.attributes('placeholder'))).toEqual([
      '请输入账号',
      '请输入登录密码',
      '请输入7位酒店编码',
    ])
    expect(inputs[1]!.attributes('type')).toBe('password')

    await wrapper.find('.login-eye').trigger('click')
    expect(inputs[1]!.attributes('type')).toBe('text')

    await wrapper.find('.login-eye').trigger('click')
    expect(inputs[1]!.attributes('type')).toBe('password')
  })

  it('空值不发登录，按缺失项逐条提示', async () => {
    const wrapper = await mountAt('/login')
    const inputs = wrapper.findAll('.login-field input')

    await wrapper.find('.login-form').trigger('submit')
    expect(wrapper.find('.login-error').text()).toBe('请输入账号')

    await inputs[0]!.setValue('ops')
    await wrapper.find('.login-form').trigger('submit')
    expect(wrapper.find('.login-error').text()).toBe('请输入登录密码')

    await inputs[1]!.setValue('password')
    await wrapper.find('.login-form').trigger('submit')
    expect(wrapper.find('.login-error').text()).toBe('请输入酒店编码')

    await inputs[2]!.setValue('123')
    await wrapper.find('.login-form').trigger('submit')
    expect(wrapper.find('.login-error').text()).toBe('酒店编码必须为7位数字')
  })

  it('未登录访问业务页会被守卫拦到登录页，并记住原地址', async () => {
    const wrapper = await mountAt('/ota')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/ota')
    expect(wrapper.find('.login-card').exists()).toBe(true)
    expect(isAuthenticated()).toBe(false)
  })

  it('账号或密码错误时留在登录页提示，不写入会话', async () => {
    const wrapper = await mountAt('/login')
    const inputs = wrapper.findAll('.login-field input')
    await inputs[0]!.setValue(DEMO_ACCOUNT)
    await inputs[1]!.setValue('not-the-password')
    await inputs[2]!.setValue(DEMO_HOTEL_CODE)

    await wrapper.find('.login-form').trigger('submit')
    await wait(800)
    await flushPromises()

    expect(wrapper.find('.login-error').text()).toBe('账号、密码或酒店编码错误')
    expect(router.currentRoute.value.name).toBe('login')
    expect(isAuthenticated()).toBe(false)
  })

  it('填齐演示账号后进入登录中状态，完成后跳转态势概览', async () => {
    const wrapper = await mountAt('/login')
    const inputs = wrapper.findAll('.login-field input')
    await inputs[0]!.setValue(DEMO_ACCOUNT)
    await inputs[1]!.setValue(DEMO_PASSWORD)
    await inputs[2]!.setValue(DEMO_HOTEL_CODE)

    await wrapper.find('.login-form').trigger('submit')
    // 提交期间按钮置灰并换成「登录中」，避免重复下发。
    expect(wrapper.find('.login-submit').text()).toContain('登录中')
    expect((wrapper.find('.login-submit').element as HTMLButtonElement).disabled).toBe(true)

    // LoginView 里的假登录是 600ms；用真实定时器等它走完，比在假定时器下推导航链稳。
    await wait(800)
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('overview')
    expect(isAuthenticated()).toBe(true)
  })

  it('点退出登录先弹确认框，取消后留在设置页且会话还在', async () => {
    authenticate(DEMO_ACCOUNT, DEMO_PASSWORD, DEMO_HOTEL_CODE)
    const wrapper = await mountAt('/settings')

    await wrapper.find('.setting-row .ghost-button').trigger('click')
    const dialog = wrapper.find('.confirm-dialog')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('退出登录')
    expect(dialog.text()).toContain(`当前账号 ${DEMO_ACCOUNT}`)

    // 只是询问：取消后路由和会话都得原样保留，别顺手把人踢下线。
    await dialog.find('.ghost-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.confirm-dialog').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('settings')
    expect(isAuthenticated()).toBe(true)
  })

  it('确认退出才清会话，业务页重新被拦回登录页', async () => {
    authenticate(DEMO_ACCOUNT, DEMO_PASSWORD, DEMO_HOTEL_CODE)
    const wrapper = await mountAt('/settings')
    expect(wrapper.text()).toContain(`已登录：${DEMO_ACCOUNT}`)

    await wrapper.find('.setting-row .ghost-button').trigger('click')
    await wrapper.find('.confirm-dialog .primary-button').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('login')
    expect(isAuthenticated()).toBe(false)

    // 退出后原来的业务页也进不去了。
    await router.push('/settings')
    expect(router.currentRoute.value.name).toBe('login')
  })
})
