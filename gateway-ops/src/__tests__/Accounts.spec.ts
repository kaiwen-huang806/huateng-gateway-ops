import { describe, expect, it, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../App.vue'
import router from '../router'
import {
  DEMO_ACCOUNT,
  DEMO_HOTEL_CODE,
  DEMO_PASSWORD,
  authenticate,
  signOut,
} from '../utils/auth'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(async () => {
  signOut()
  authenticate(DEMO_ACCOUNT, DEMO_PASSWORD, DEMO_HOTEL_CODE)
  await router.push('/accounts')
  await router.isReady()
})

describe('账号管理中心', () => {
  it('所有演示账号显示账号自身编号', async () => {
    const wrapper = mount(App, {
      global: { plugins: [createPinia(), router] },
    })
    await wait(160)
    await flushPromises()

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(7)
    expect(wrapper.findAll('.account-id').map((cell) => cell.text())).toEqual([
      '1001',
      '1002',
      '1003',
      '1004',
      '1005',
      '1006',
      '1007',
    ])
  })

  it('新增和编辑表单都能看到密码但不提供酒店编码选项，当前账号状态不可修改', async () => {
    const wrapper = mount(App, {
      global: { plugins: [createPinia(), router] },
    })
    await wait(160)
    await flushPromises()

    const adminRow = wrapper.findAll('tbody tr').find((row) => row.text().includes('admin'))
    expect(adminRow).toBeDefined()
    expect(adminRow?.find('.status-switch').attributes('disabled')).toBeDefined()

    await adminRow?.find('.text-button').trigger('click')
    const editor = wrapper.find('.account-dialog')
    expect((editor.find('input[name="password"]').element as HTMLInputElement).value).toBe('12345')
    expect(editor.find('input[name="hotelCode"]').exists()).toBe(false)
    expect(editor.findAll('select').filter((select) => select.attributes('disabled') !== undefined)).toHaveLength(1)

    await editor.find('.ghost-button').trigger('click')
    await wrapper.find('.primary-button').trigger('click')
    const createEditor = wrapper.find('.account-dialog')
    expect((createEditor.find('input[name="password"]').element as HTMLInputElement).value).toBe('12345')
    expect(createEditor.find('input[name="hotelCode"]').exists()).toBe(false)
  })
})
