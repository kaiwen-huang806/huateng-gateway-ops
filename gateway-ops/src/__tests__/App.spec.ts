import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import dayjs from 'dayjs'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import router from '../router'
import App from '../App.vue'
import type { ViewKey } from '../types/gateway'
import { useGatewayStore } from '../stores/gateway'
import { latestLogOf, logsInDateRange } from '../utils/logs'
import { DEMO_ACCOUNT, DEMO_PASSWORD, authenticate } from '../utils/auth'

const viewKeys: ViewKey[] = ['overview', 'rooms', 'ota', 'logs', 'settings']

// 业务页现在挂在登录守卫后面，这些用例只关心运维台自身，统一先「登录」再跑。
beforeEach(() => {
  authenticate(DEMO_ACCOUNT, DEMO_PASSWORD)
})

describe('App', () => {
  it('mounts renders properly', async () => {
    await router.push('/overview')
    await router.isReady()
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), router],
      },
    })
    expect(wrapper.text()).toContain('态势概览')
    expect(wrapper.text()).toContain('华腾智能')
  })

  it('lists only abnormal logs in the overview alert panel', async () => {
    await router.push('/overview')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)

    // 告警列表只看异常：正常的 INFO 流水被过滤掉，顺序仍是时间倒序。
    expect(store.alertLogs).toEqual(store.allLogs.filter((log) => log.level !== 'INFO'))
    expect(store.alertLogs.length).toBeGreaterThan(0)

    // 面板最多展示最近 5 条，每条都能对上同一份数据。
    const rows = wrapper.findAll('.alert-row')
    expect(rows).toHaveLength(5)
    rows.forEach((row, index) => {
      const log = store.alertLogs[index]!
      expect(row.find('.level').text()).toBe(log.level)
      expect(row.find('time').text()).toBe(log.time)
      expect(row.find('span').text()).toBe(`${log.room} · ${log.message}`)
      expect(log.level).not.toBe('INFO')
    })
  })

  it('registers a named route for every view key', () => {
    for (const key of viewKeys) {
      expect(router.resolve({ name: key }).name).toBe(key)
    }
  })

  it('renders a room deep link and returns to the floor list', async () => {
    await router.push('/rooms/803')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    expect(wrapper.text()).toContain('803 设备清单')
    expect(wrapper.text()).toContain('返回 8F')

    await wrapper.find('.back-button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/rooms')
    expect(useGatewayStore(pinia).selectedFloor).toBe('8F')
  })

  it('gives every room the four new device types, each with its own controls', async () => {
    await router.push('/rooms/301')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)

    // 每间客房都是同一套 8 类设备，新增的四种追加在原有四种之后（老设备 id 不变）。
    const room = store.rooms.find((item) => item.id === '301')!
    expect(room.devices).toEqual([
      '301-light',
      '301-ac',
      '301-curtain',
      '301-lock',
      '301-nightlight',
      '301-kettle',
      '301-tv',
      '301-thermostat',
    ])
    expect(store.devices).toHaveLength(store.rooms.length * room.devices.length)
    expect(new Set(store.devices.map((device) => device.type))).toEqual(
      new Set(Object.keys(store.deviceMeta)),
    )
    // 新类型里也要有离线设备，OTA 与状态展示才有"正常/异常"的样本。
    for (const type of ['nightlight', 'kettle', 'tv', 'thermostat'] as const) {
      expect(
        store.devices.filter((device) => device.type === type && !device.online).length,
      ).toBeGreaterThan(0)
    }

    // 房间设备清单里新类型各有一张卡，名称与类型文案取自设备元数据。
    expect(wrapper.findAll('.device-card')).toHaveLength(room.devices.length)
    for (const label of ['夜灯', '热水壶', '电视', '温控面板']) {
      expect(wrapper.text()).toContain(label)
    }

    // 新类型同样能打开设备弹窗，状态页有参数、控制页有各自的下发项。
    const cases = [
      ['301-nightlight', ['电源开关', '亮度调节', '色温', '延时关闭']],
      ['301-kettle', ['电源开关', '目标水温', '保温模式']],
      ['301-tv', ['电源开关', '音量', '信号源']],
      ['301-thermostat', ['运行模式', '目标温度', '风速', '面板锁定']],
    ] as const
    for (const [id, labels] of cases) {
      store.openDevice(store.devices.find((device) => device.id === id)!)
      await nextTick()
      // 参数都有值，不会出现取不到参数留下的占位符。
      expect(wrapper.find('.param-grid').text()).not.toContain('--')

      await wrapper.findAll('.modal-tabs button')[1]!.trigger('click')
      const controls = wrapper.find('.control-list')
      expect(controls.exists()).toBe(true)
      for (const label of labels) expect(controls.text()).toContain(label)

      store.selectedDevice = null
      await nextTick()
    }
  })

  it('renders the OTA view with each device firmware and the toolbar filters', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    // 工具栏顺序：房间号 → 设备类型 → 在线状态。
    const labels = wrapper.findAll('.toolbar label')
    expect(labels.map((label) => label.text().split(/\s/)[0])).toEqual([
      '房间号',
      '设备类型',
      '在线状态',
    ])
    // 按标签文字定位下拉，避免调整顺序时定位到别人身上。
    const statusFilter = labels.find((label) => label.text().startsWith('在线状态'))!.find('select')
    const statusOptions = statusFilter.findAll('option')

    // 不连云：列表只显示设备自己的当前固件，不再挂一个网关记录的"最新版本"。
    expect(wrapper.find('.ota-item').text()).toContain('当前固件 v2.3.0')
    expect(wrapper.text()).not.toContain('网关记录')
    expect(wrapper.text()).not.toContain('最新 v')
    expect(wrapper.find('.count-tag').exists()).toBe(false)

    // 显示文字与取值是分开的：改文案不会影响筛选逻辑。
    expect(statusOptions.map((option) => option.text())).toEqual(['在线', '离线', '全部'])
    expect(statusOptions.map((option) => option.attributes('value'))).toEqual([
      'online',
      'offline',
      'all',
    ])
    // 默认取值必须能在选项里找到，否则下拉会显示空白且筛不出任何设备。
    expect((statusFilter.element as HTMLSelectElement).value).toBe('all')

    await statusFilter.setValue('offline')
    await flushPromises()
    expect(wrapper.findAll('.ota-item')).toHaveLength(
      store.devices.filter((device) => !device.online).length,
    )

    // 房间号搜索框：文本框（非下拉）带「房间号」标签，按房间号子串过滤。
    const roomSearch = wrapper.find('.search-box input')
    expect(wrapper.find('.toolbar').text()).toContain('房间号')
    expect(roomSearch.attributes('placeholder')).toBe('如 803')

    await statusFilter.setValue('all')
    await roomSearch.setValue('803')
    await flushPromises()
    expect(wrapper.findAll('.ota-item')).toHaveLength(
      store.devices.filter((device) => device.room.includes('803')).length,
    )
  })

  it('uploads a local firmware file before upgrading a single device', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const buttons = wrapper.findAll('.ota-item .primary-button')
    const index = buttons.findIndex((button) => !(button.element as HTMLButtonElement).disabled)
    const target = store.devices[index]!
    const submit = () => wrapper.find('.confirm-footer .primary-button').trigger('click')

    expect(wrapper.find('.confirm-dialog').exists()).toBe(false)

    await buttons[index]!.trigger('click')
    const dialog = wrapper.find('.confirm-dialog')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('上传固件升级')
    expect(dialog.text()).toContain(`${target.room} · ${target.name}`)
    // 没选本地固件时不允许提交，也还没真正下发升级。
    await submit()
    expect(wrapper.find('.confirm-dialog').exists()).toBe(true)
    expect(store.toastMessage).toBe('请先选择本地固件文件')
    expect(store.devices.some((device) => store.otaBusy(device))).toBe(false)

    // 选择本地固件后，文件名直接显示在弹窗里。
    const firmware = new File(['firmware'], '2035网关固件V2.5.0.bin')
    const fileInput = wrapper.find('.confirm-dialog input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { value: [firmware], configurable: true })
    await fileInput.trigger('change')
    expect(wrapper.find('.confirm-dialog .file-name').text()).toContain('2035网关固件V2.5.0.bin')

    await submit()
    expect(wrapper.find('.confirm-dialog').exists()).toBe(false)
    expect(target.otaStatus).toBe('transferring')
    expect(store.devices.filter((device) => store.otaBusy(device))).toHaveLength(1)
    // 固件名称取文件名去扩展名，版本从文件名解析。
    expect(store.uploadedFirmware?.version).toBe('v2.5.0')
    expect(store.uploadedFirmware).toEqual({
      name: '2035网关固件V2.5.0',
      fileName: '2035网关固件V2.5.0.bin',
      version: 'v2.5.0',
    })
  })

  it('enters batch mode and locks the device type of the batch', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    // 列表顺序与 store.devices 一致，按设备 id 反查勾选框。
    const boxOf = (id: string) =>
      wrapper.findAll('.ota-check input')[store.devices.findIndex((item) => item.id === id)]!
    const countTag = () => wrapper.find('.batch-actions .count-tag').text()
    const submitButton = () => wrapper.find('.batch-actions .primary-button')
    const upgradeable = store.devices.filter((device) => store.canUpgrade(device))
    const light = upgradeable.find((device) => device.type === 'light')!
    const otherType = upgradeable.find((device) => device.type !== 'light')!

    // 默认不在选择模式：按钮文案是「批量升级」，列表里没有勾选框。
    expect(wrapper.find('.toolbar .primary-button').text()).toContain('批量升级')
    expect(wrapper.findAll('.ota-check')).toHaveLength(0)

    await wrapper.find('.toolbar .primary-button').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.ota-check')).toHaveLength(store.devices.length)
    expect(wrapper.find('.batch-hint').text()).toContain('勾选第一台设备后将锁定其类型')
    // 一台都没勾选时不能提交。
    expect((submitButton().element as HTMLButtonElement).disabled).toBe(true)

    // 勾第一台灯具 → 本批次锁定「智能灯具」。
    await boxOf(light.id).setValue(true)
    await flushPromises()
    expect(countTag()).toContain('已选 1 台')
    expect(wrapper.find('.batch-hint').text()).toContain('本批次已锁定「智能灯具」')
    expect(wrapper.findAll('.ota-item.picked')).toHaveLength(1)

    // 其它类型的勾选框置灰，强行勾选也进不了本批次。
    expect(boxOf(otherType.id).attributes('disabled')).toBeDefined()
    await boxOf(otherType.id).setValue(true)
    await flushPromises()
    expect(countTag()).toContain('已选 1 台')

    // 取消唯一一台设备的勾选后，类型锁随之解除。
    await boxOf(light.id).setValue(false)
    await flushPromises()
    expect(countTag()).toContain('已选 0 台')
    expect(wrapper.find('.batch-hint').text()).toContain('勾选第一台设备后将锁定其类型')
    expect(boxOf(otherType.id).attributes('disabled')).toBeUndefined()
  })

  it('hides the per-device upgrade button while in batch mode', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)

    // 默认：每台设备末尾都有「开始升级」。
    expect(wrapper.findAll('.ota-item .primary-button')).toHaveLength(store.devices.length)

    await wrapper.find('.toolbar .primary-button').trigger('click')
    await flushPromises()
    // 批量模式：单台按钮让位给勾选框，避免和批次流程混在一起。
    expect(wrapper.findAll('.ota-item .primary-button')).toHaveLength(0)
    expect(wrapper.findAll('.ota-check')).toHaveLength(store.devices.length)

    // 退出选择模式后恢复。
    await wrapper.findAll('.batch-actions .ghost-button')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.ota-item .primary-button')).toHaveLength(store.devices.length)
  })

  it('selects all visible upgradeable devices and keeps hidden selections in the batch', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const typeSelect = wrapper.findAll('.toolbar select')[0]!
    const statusSelect = wrapper.findAll('.toolbar select')[1]!
    const roomSearch = wrapper.find('.search-box input')
    const countTag = () => wrapper.find('.batch-actions .count-tag').text()
    const selectAllButton = () => wrapper.findAll('.batch-actions .ghost-button')[0]!
    const lights = store.devices.filter((device) => device.type === 'light')
    const upgradeableLights = lights.filter((device) => store.canUpgrade(device))
    const lightsInRoom302 = upgradeableLights.filter((device) => device.room.includes('302'))

    await wrapper.find('.toolbar .primary-button').trigger('click')
    await flushPromises()

    // 「设备类型」为全部类型时不提供全选：只留已选台数、取消、开始升级。
    expect(wrapper.find('.batch-actions').text()).not.toContain('全选')
    expect(wrapper.findAll('.batch-actions .ghost-button')).toHaveLength(1)
    expect(wrapper.findAll('.batch-actions .ghost-button')[0]!.text()).toBe('取消')
    expect(wrapper.find('.batch-actions .count-tag').text()).toContain('已选 0 台')

    // 先按类型筛选再「全选」：只勾当前筛选结果里可升级的设备。
    await typeSelect.setValue('light')
    await flushPromises()
    expect(wrapper.findAll('.ota-item')).toHaveLength(lights.length)
    expect(wrapper.findAll('.batch-actions .ghost-button')).toHaveLength(2)

    await selectAllButton().trigger('click')
    await flushPromises()
    expect(countTag()).toContain(`已选 ${upgradeableLights.length} 台`)
    expect(wrapper.findAll('.ota-item.picked')).toHaveLength(upgradeableLights.length)

    // 用房间号筛掉大部分设备：勾选不因筛选而丢失，并提示有多少台不在当前筛选内。
    await roomSearch.setValue('302')
    await flushPromises()
    expect(countTag()).toContain(`已选 ${upgradeableLights.length} 台`)
    expect(wrapper.find('.batch-hint').text()).toContain(
      `有 ${upgradeableLights.length - lightsInRoom302.length} 台不在当前筛选内`,
    )
    // 当前筛选结果已被全部勾上，按钮切成「取消全选」。
    expect(selectAllButton().text()).toBe('取消全选')

    // 只看离线的灯具：结果里没有可升级设备，这时「全选」才置灰，并用悬停文案说明原因。
    await roomSearch.setValue('')
    await statusSelect.setValue('offline')
    await flushPromises()
    expect((selectAllButton().element as HTMLButtonElement).disabled).toBe(true)
    expect(selectAllButton().attributes('title')).toBe('当前筛选结果里没有可升级的设备')
  })

  it('clears the batch when the device type filter switches to another type', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const typeSelect = wrapper.findAll('.toolbar select')[0]!
    const countTag = () => wrapper.find('.batch-actions .count-tag').text()
    const selectAllButton = () => wrapper.findAll('.batch-actions .ghost-button')[0]!
    const boxOf = (id: string) =>
      wrapper.findAll('.ota-check input')[store.devices.findIndex((item) => item.id === id)]!
    const ac = store.devices.find((device) => device.type === 'ac' && store.canUpgrade(device))!
    const upgradeableLights = store.devices.filter(
      (device) => device.type === 'light' && store.canUpgrade(device),
    )

    // 在「全部类型」下勾一台空调，类型锁落到中央空调。
    await wrapper.find('.toolbar .primary-button').trigger('click')
    await flushPromises()
    await boxOf(ac.id).setValue(true)
    await flushPromises()
    expect(countTag()).toContain('已选 1 台')
    expect(wrapper.find('.batch-hint').text()).toContain('本批次已锁定「中央空调」')

    // 切到智能灯具：旧批次清空，否则藏起来的空调会一直锁着类型，灯具一台都勾不动。
    await typeSelect.setValue('light')
    await flushPromises()
    expect(countTag()).toContain('已选 0 台')
    expect(wrapper.find('.batch-hint').text()).toContain('勾选第一台设备后将锁定其类型')
    expect(store.toastMessage).toBe('已切换到智能灯具，本批次已清空')

    // 全选不再置灰，且能把当前类型的可升级设备全部勾上。
    expect((selectAllButton().element as HTMLButtonElement).disabled).toBe(false)
    expect(boxOf(upgradeableLights[0]!.id).attributes('disabled')).toBeUndefined()
    await selectAllButton().trigger('click')
    await flushPromises()
    expect(countTag()).toContain(`已选 ${upgradeableLights.length} 台`)
  })

  it('upgrades only the selected same-type devices after uploading a local firmware file', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const boxOf = (id: string) =>
      wrapper.findAll('.ota-check input')[store.devices.findIndex((item) => item.id === id)]!
    const countTag = () => wrapper.find('.batch-actions .count-tag').text()
    const startBatch = () => wrapper.find('.batch-actions .primary-button')
    const upgradingIds = () =>
      store.devices.filter((device) => store.otaBusy(device)).map((device) => device.id)
    const lights = store.devices.filter(
      (device) => device.type === 'light' && store.canUpgrade(device),
    )
    expect(lights.length).toBeGreaterThan(1)

    await wrapper.find('.toolbar .primary-button').trigger('click')
    await flushPromises()
    await boxOf(lights[0]!.id).setValue(true)
    await boxOf(lights[1]!.id).setValue(true)
    await flushPromises()
    expect(countTag()).toContain('已选 2 台')

    await startBatch().trigger('click')
    const dialog = wrapper.find('.confirm-dialog')
    expect(dialog.exists()).toBe(true)
    // 弹窗里交代清楚批次范围与设备类型。
    expect(dialog.text()).toContain('本次共 2 台智能灯具')

    // 取消后既不发升级，也不该留下任何升级中的设备；勾选保留，方便重选固件。
    await wrapper.find('.confirm-footer .ghost-button').trigger('click')
    expect(wrapper.find('.confirm-dialog').exists()).toBe(false)
    expect(store.devices.some((device) => store.otaBusy(device))).toBe(false)
    expect(countTag()).toContain('已选 2 台')

    // 重新打开时表单是干净的，不会残留上一次选的固件。
    await startBatch().trigger('click')
    expect(wrapper.find('.confirm-dialog .file-name').text()).toContain('未选择文件')
    expect(wrapper.findAll('.confirm-dialog input[type="text"]')).toHaveLength(0)

    const firmware = new File(['firmware'], '2035网关固件V2.5.0.bin')
    const fileInput = wrapper.find('.confirm-dialog input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { value: [firmware], configurable: true })
    await fileInput.trigger('change')
    await wrapper.find('.confirm-footer .primary-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.confirm-dialog').exists()).toBe(false)
    expect(store.uploadedFirmware?.version).toBe('v2.5.0')
    // 并发上限 5 台，这里两台都立即下发；其它设备（含其它类型）不能被一起带上去。
    expect([...upgradingIds()].sort()).toEqual([lights[0]!.id, lights[1]!.id].sort())
    expect(store.batchStats.total).toBe(2)
    // 提交成功后自动退出选择模式，列表恢复成单台升级的样子。
    expect(wrapper.findAll('.ota-check')).toHaveLength(0)
    expect(wrapper.find('.toolbar .primary-button').text()).toContain('批量升级')
  })

  it('still allows upgrading when every online device matches the gateway record', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    // 旧逻辑用「固件 !== 网关记录的版本」当前置条件，这里把全站固件都对齐成同一个版本：
    // 那种写法会让上传固件的入口彻底打不开，现在仍应能正常选设备升级。
    store.devices.forEach((device) => {
      device.firmware = 'v2.4.1'
    })
    await flushPromises()

    await wrapper.find('.toolbar .primary-button').trigger('click')
    await flushPromises()
    const selectable = wrapper
      .findAll('.ota-check input')
      .filter((box) => box.attributes('disabled') === undefined)
    expect(selectable).toHaveLength(store.devices.filter((device) => device.online).length)

    // 仍然能选设备、打开上传固件弹窗并下发新版本。
    await selectable[0]!.setValue(true)
    await flushPromises()
    await wrapper.find('.batch-actions .primary-button').trigger('click')
    expect(wrapper.find('.confirm-dialog').exists()).toBe(true)

    const firmware = new File(['firmware'], '2035网关固件V2.5.0.bin')
    const fileInput = wrapper.find('.confirm-dialog input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { value: [firmware], configurable: true })
    await fileInput.trigger('change')
    await wrapper.find('.confirm-footer .primary-button').trigger('click')
    await flushPromises()
    expect(store.devices.filter((device) => store.otaBusy(device))).toHaveLength(1)
    expect(store.uploadedFirmware?.version).toBe('v2.5.0')
  })

  it('reflashes the same version without asking for extra confirmation', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const ac = store.devices.find((device) => device.type === 'ac' && device.online)!
    expect(ac.firmware).toBe('v2.4.0')

    await wrapper.find('.toolbar .primary-button').trigger('click')
    await flushPromises()
    const index = store.devices.findIndex((device) => device.id === ac.id)
    await wrapper.findAll('.ota-check input')[index]!.setValue(true)
    await flushPromises()
    await wrapper.find('.batch-actions .primary-button').trigger('click')

    // 目标版本与设备当前固件一致：明确说明是覆盖重刷，且不需要额外确认。
    const firmware = new File(['firmware'], '网关固件V2.4.0.bin')
    const fileInput = wrapper.find('.confirm-dialog input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { value: [firmware], configurable: true })
    await fileInput.trigger('change')
    await flushPromises()
    expect(wrapper.find('.firmware-summary').text()).toContain('目标版本 v2.4.0')
    expect(wrapper.find('.firmware-summary').text()).toContain('1 台同版本覆盖重刷')
    expect(wrapper.find('.downgrade-confirm').exists()).toBe(false)
    expect(
      (wrapper.find('.confirm-footer .primary-button').element as HTMLButtonElement).disabled,
    ).toBe(false)

    await wrapper.find('.confirm-footer .primary-button').trigger('click')
    await flushPromises()
    expect(ac.otaStatus).toBe('transferring')
    expect(store.uploadedFirmware?.version).toBe('v2.4.0')
  })

  it('requires a manual confirmation before a downgrade', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const ac = store.devices.find((device) => device.type === 'ac' && device.online)!

    await wrapper.find('.toolbar .primary-button').trigger('click')
    await flushPromises()
    const index = store.devices.findIndex((device) => device.id === ac.id)
    await wrapper.findAll('.ota-check input')[index]!.setValue(true)
    await flushPromises()
    await wrapper.find('.batch-actions .primary-button').trigger('click')

    // 目标版本低于设备当前固件：给出提示并强制人工确认。
    const firmware = new File(['firmware'], '网关固件V2.3.0.bin')
    const fileInput = wrapper.find('.confirm-dialog input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { value: [firmware], configurable: true })
    await fileInput.trigger('change')
    await flushPromises()
    expect(wrapper.find('.firmware-summary').text()).toContain('目标版本 v2.3.0')
    expect(wrapper.find('.firmware-summary').text()).toContain('1 台降级')
    expect(wrapper.find('.downgrade-confirm').text()).toContain('降级到 v2.3.0')

    const submit = wrapper.find('.confirm-footer .primary-button')
    expect((submit.element as HTMLButtonElement).disabled).toBe(true)
    // 按钮本身就是闸门：未确认时点它不会下发任何升级。
    await submit.trigger('click')
    expect(store.devices.some((device) => store.otaBusy(device))).toBe(false)
    expect(wrapper.find('.confirm-dialog').exists()).toBe(true)

    // 勾选确认后才能提交，降级结果写进日志。
    await wrapper.find('.downgrade-confirm input').setValue(true)
    expect((submit.element as HTMLButtonElement).disabled).toBe(false)
    await submit.trigger('click')
    await flushPromises()
    expect(ac.otaStatus).toBe('transferring')
    expect(store.uploadedFirmware?.version).toBe('v2.3.0')
    expect(ac.logs[0]!.message).toContain('开始固件降级 → v2.3.0')
    expect(ac.logs[0]!.level).toBe('WARN')
  })

  it('blocks the upload when the file name carries no version number', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const ac = store.devices.find((device) => device.type === 'ac' && device.online)!

    await wrapper.find('.toolbar .primary-button').trigger('click')
    await flushPromises()
    const index = store.devices.findIndex((device) => device.id === ac.id)
    await wrapper.findAll('.ota-check input')[index]!.setValue(true)
    await flushPromises()
    await wrapper.find('.batch-actions .primary-button').trigger('click')

    // 不连云时没有别处能提供目标版本，文件名读不出 x.y.z 就直接拦住，而不是猜一个版本。
    const firmware = new File(['firmware'], 'gateway_firmware.bin')
    const fileInput = wrapper.find('.confirm-dialog input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { value: [firmware], configurable: true })
    await fileInput.trigger('change')
    await flushPromises()
    expect(wrapper.find('.firmware-summary').text()).toContain('文件名里没有版本号')
    expect(
      (wrapper.find('.confirm-footer .primary-button').element as HTMLButtonElement).disabled,
    ).toBe(true)

    await wrapper.find('.confirm-footer .primary-button').trigger('click')
    expect(wrapper.find('.confirm-dialog').exists()).toBe(true)
    expect(store.devices.some((device) => store.otaBusy(device))).toBe(false)
    expect(store.uploadedFirmware).toBeNull()
  })

  it('fails a single upgrade at the write step without faking success', () => {
    vi.useFakeTimers()
    try {
      const store = useGatewayStore(createPinia())
      const ac = store.devices.find((device) => device.type === 'ac' && device.online)!
      store.otaFault = 'write'

      store.startUpgrade(ac, 'v2.5.0')
      expect(ac.otaStatus).toBe('transferring')
      vi.advanceTimersByTime(250 * 8 + 10)

      expect(ac.otaStatus).toBe('failed')
      expect(ac.otaError?.code).toBe('write')
      expect(ac.otaError?.message).toContain('写入失败')
      expect(ac.otaError?.at).toMatch(/^\d{2}:\d{2}:\d{2}$/)
      // 关键：失败不能把固件版本改成目标版本，否则就是假成功。
      expect(ac.firmware).toBe('v2.4.0')
      expect(ac.otaTarget).toBe('v2.5.0')
      expect(ac.otaAttempts).toBe(1)
      expect(ac.logs[0]!.level).toBe('ERROR')
      expect(ac.logs[0]!.message).toContain('固件升级失败 → v2.5.0')
      expect(store.toastKind).toBe('err')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports checksum and timeout failures at their own stages', () => {
    vi.useFakeTimers()
    try {
      const store = useGatewayStore(createPinia())
      const online = store.devices.filter((device) => device.online)
      const [checksumDevice, timeoutDevice] = [online[0]!, online[1]!]

      store.otaFault = 'checksum'
      store.startUpgrade(checksumDevice, 'v2.5.0')
      vi.advanceTimersByTime(250 * 3 + 10)
      expect(checksumDevice.otaStatus).toBe('failed')
      expect(checksumDevice.otaError?.code).toBe('checksum')
      expect(checksumDevice.progress).toBe(39)

      store.otaFault = 'timeout'
      store.startUpgrade(timeoutDevice, 'v2.5.0')
      vi.advanceTimersByTime(250 * 3 + 10)
      // 超时不是当场判死：进度先卡住，超过阈值才给结论。
      expect(timeoutDevice.otaStatus).toBe('transferring')
      expect(timeoutDevice.progress).toBe(39)
      vi.advanceTimersByTime(6000 + 10)
      expect(timeoutDevice.otaStatus).toBe('failed')
      expect(timeoutDevice.otaError?.code).toBe('timeout')
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries the previous target version and clears the failure once it succeeds', () => {
    vi.useFakeTimers()
    try {
      const store = useGatewayStore(createPinia())
      const ac = store.devices.find((device) => device.type === 'ac' && device.online)!

      store.otaFault = 'write'
      store.startUpgrade(ac, 'v2.5.0')
      vi.advanceTimersByTime(250 * 8 + 10)
      expect(ac.otaStatus).toBe('failed')

      // 重试复用上一次的目标版本与固件包，不需要重新选文件。
      store.otaFault = 'none'
      store.retryUpgrade(ac)
      expect(ac.otaStatus).toBe('transferring')
      expect(ac.otaTarget).toBe('v2.5.0')
      expect(ac.otaAttempts).toBe(2)

      vi.advanceTimersByTime(250 * 8 + 10)
      expect(ac.otaStatus).toBe('success')
      expect(ac.otaError).toBeNull()
      expect(ac.firmware).toBe('v2.5.0')
      expect(ac.logs[0]!.level).toBe('INFO')
      expect(ac.logs[0]!.message).toContain('固件升级完成 → v2.5.0')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the failure inline with retry, and opens the device OTA tab from 详情', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const ac = store.devices.find((device) => device.type === 'ac' && device.online)!

    // 开发环境的故障注入开关：演示升级失败用，生产构建不会渲染。
    const injection = wrapper.find('.dev-injection select')
    expect(injection.exists()).toBe(true)
    await injection.setValue('write')
    expect(store.otaFault).toBe('write')

    vi.useFakeTimers()
    try {
      store.startUpgrade(ac, 'v2.5.0')
      await vi.advanceTimersByTimeAsync(250 * 8 + 10)
      await nextTick()

      const failed = wrapper.find('.ota-failed')
      expect(failed.exists()).toBe(true)
      expect(failed.text()).toContain('写入失败')
      expect(failed.text()).toContain('重试')
      expect(failed.text()).toContain('详情')
      // 设备行仍显示旧版本，失败不会被写成"已升级至 v2.5.0"。
      const failedRow = wrapper
        .findAll('.ota-item')
        .find((item) => item.find('.ota-failed').exists())!
      expect(failedRow.text()).toContain('当前固件 v2.4.0')
      expect(failedRow.text()).not.toContain('已升级至')

      await failed.findAll('button')[1]!.trigger('click')
      expect(store.deviceTab).toBe('ota')
      expect(store.selectedDevice?.id).toBe(ac.id)
      const detail = wrapper.find('.ota-result.failed')
      expect(detail.exists()).toBe(true)
      expect(detail.text()).toContain('写入失败')
      expect(detail.text()).toContain('v2.5.0')
      expect(detail.text()).toContain('尝试次数')

      // 详情里也能直接重试：切回正常后重新下发。
      store.otaFault = 'none'
      const retryInDetail = wrapper.find('.ota-actions .ghost-button')
      expect(retryInDetail.exists()).toBe(true)
      await retryInDetail.trigger('click')
      expect(ac.otaStatus).toBe('transferring')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps at most five devices in flight and blocks new upgrades while a batch runs', () => {
    vi.useFakeTimers()
    try {
      const store = useGatewayStore(createPinia())
      const lights = store.devices.filter(
        (device) => device.type === 'light' && store.canUpgrade(device),
      )
      expect(lights.length).toBeGreaterThan(5)

      store.requestUpgradeMany(lights)
      store.confirmUpgrade({
        name: '2030网关固件V2.5.0',
        fileName: '2030网关固件V2.5.0.bin',
        version: 'v2.5.0',
      })

      // 并发上限 5 台：其余全部排队等待。
      expect(store.batchStats.total).toBe(lights.length)
      expect(store.batchStats.running).toBe(5)
      expect(store.batchStats.queued).toBe(lights.length - 5)

      // 批次进行中：既不能再开一批，也不能给批次外的设备下发单台升级。
      store.requestUpgradeMany(lights)
      expect(store.pendingUpgrade).toHaveLength(0)
      expect(store.toastMessage).toContain('当前批次还在进行中')

      // 第一批跑完，队列自动顶上第二批。
      vi.advanceTimersByTime(250 * 8)
      expect(store.batchStats.success).toBe(5)
      expect(store.batchStats.running).toBe(5)
      expect(store.batchStats.queued).toBe(lights.length - 10)

      // 四批之后全部结束，并给出一条批次汇总。
      vi.advanceTimersByTime(250 * 8 * 4)
      expect(store.batchStats.finished).toBe(true)
      expect(store.batchStats.success).toBe(lights.length)
      expect(store.batchStats.failed).toBe(0)
      expect(store.toastMessage).toContain(`批量升级结束：成功 ${lights.length} 台`)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a partial batch failure and retries only the failed devices', () => {
    vi.useFakeTimers()
    try {
      const store = useGatewayStore(createPinia())
      const lights = store.devices.filter(
        (device) => device.type === 'light' && store.canUpgrade(device),
      )
      // 演示注入：批次内每 5 台里的后 3 台在写入阶段失败，前 2 台正常。
      store.otaFault = 'batch-partial'
      store.requestUpgradeMany(lights)
      store.confirmUpgrade({
        name: '2030网关固件V2.5.0',
        fileName: '2030网关固件V2.5.0.bin',
        version: 'v2.5.0',
      })

      vi.advanceTimersByTime(250 * 8 * 5)
      const failed = lights.filter((_, index) => index % 5 >= 2).length
      expect(failed).toBeGreaterThan(0)
      expect(store.batchStats.finished).toBe(true)
      expect(store.batchStats.failed).toBe(failed)
      expect(store.batchStats.success).toBe(lights.length - failed)
      // 失败设备的固件版本没有被改成目标版本。
      const failedDevice = store.batchDevices.find((device) => device.otaStatus === 'failed')!
      expect(failedDevice.firmware).toBe('v2.3.0')

      // 批次内重试：只重排失败的，复用同一个目标版本，不重新上传。
      store.otaFault = 'none'
      store.retryFailedInBatch()
      // 重试的设备先占满并发槽位，超出的继续排队。
      expect(store.batchStats.running).toBe(Math.min(5, failed))
      expect(store.batchStats.queued).toBe(Math.max(0, failed - 5))
      vi.advanceTimersByTime(250 * 8 * Math.ceil(failed / 5))
      expect(store.batchStats.failed).toBe(0)
      expect(store.batchStats.success).toBe(lights.length)
      expect(failedDevice.firmware).toBe('v2.5.0')
      expect(failedDevice.otaAttempts).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops only the devices that have not been dispatched yet', () => {
    vi.useFakeTimers()
    try {
      const store = useGatewayStore(createPinia())
      const lights = store.devices.filter(
        (device) => device.type === 'light' && store.canUpgrade(device),
      )
      store.requestUpgradeMany(lights)
      store.confirmUpgrade({
        name: '2030网关固件V2.5.0',
        fileName: '2030网关固件V2.5.0.bin',
        version: 'v2.5.0',
      })

      store.stopBatchQueue()
      expect(store.batchStats.stopped).toBe(lights.length - 5)
      expect(store.batchStats.queued).toBe(0)
      expect(store.batchStats.running).toBe(5)

      // 已经在刷的 5 台停不下来，跑完就算批次结束。
      vi.advanceTimersByTime(250 * 8)
      expect(store.batchStats.finished).toBe(true)
      expect(store.batchStats.success).toBe(5)
      expect(store.toastMessage).toContain('停止下发')
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens the batch panel after submitting and keeps the batch running when closed', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const boxOf = (id: string) =>
      wrapper.findAll('.ota-check input')[store.devices.findIndex((item) => item.id === id)]!
    const lights = store.devices.filter(
      (device) => device.type === 'light' && store.canUpgrade(device),
    )

    // 面板初始不存在。
    expect(wrapper.find('.batch-dialog').exists()).toBe(false)

    await wrapper.find('.toolbar .primary-button').trigger('click')
    await flushPromises()
    await boxOf(lights[0]!.id).setValue(true)
    await boxOf(lights[1]!.id).setValue(true)
    await flushPromises()
    await wrapper.find('.batch-actions .primary-button').trigger('click')
    await flushPromises()
    const firmware = new File(['firmware'], '2030网关固件V2.5.0.bin')
    const fileInput = wrapper.find('.confirm-dialog input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { value: [firmware], configurable: true })
    await fileInput.trigger('change')
    await wrapper.find('.confirm-footer .primary-button').trigger('click')
    await flushPromises()

    // 提交后自动打开批次面板，并显示批次范围与汇总。
    const panel = wrapper.find('.batch-dialog')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('目标版本 v2.5.0')
    expect(panel.text()).toContain('2030网关固件V2.5.0.bin')
    expect(panel.text()).toContain('已提交 2 台')
    expect(panel.text()).toContain('关闭本面板不会中断升级')
    expect(panel.findAll('.batch-row')).toHaveLength(2)

    // 关掉面板 ≠ 停止升级。
    await panel.find('.icon-button').trigger('click')
    expect(wrapper.find('.batch-dialog').exists()).toBe(false)
    expect(store.batchRunning).toBe(true)

    // 工具栏按钮变成"打开批次面板"，并带进行中角标。
    const entry = wrapper.find('.toolbar .batch-entry')
    expect(entry.text()).toContain('批量升级')
    expect(entry.text()).toContain('进行中')
    await entry.trigger('click')
    expect(wrapper.find('.batch-dialog').exists()).toBe(true)

    // 批次还在下发：面板里的「进入下一批升级」置灰，避免同时存在两批。
    const nextBatch = () =>
      wrapper
        .findAll('.batch-dialog .confirm-footer button')
        .find((button) => button.text().includes('进入下一批升级'))!
    expect((nextBatch().element as HTMLButtonElement).disabled).toBe(true)
    expect(nextBatch().attributes('title')).toContain('还在下发中')
  })

  it('re-enters batch selection after a finished batch instead of replaying the last panel', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const lights = store.devices.filter(
      (device) => device.type === 'light' && store.canUpgrade(device),
    )
    const boxOf = (id: string) =>
      wrapper.findAll('.ota-check input')[store.devices.findIndex((item) => item.id === id)]!

    vi.useFakeTimers()
    try {
      store.requestUpgradeMany([lights[0]!, lights[1]!])
      store.confirmUpgrade({
        name: '2030网关固件V2.5.0',
        fileName: '2030网关固件V2.5.0.bin',
        version: 'v2.5.0',
      })
      await nextTick()
      expect(wrapper.find('.batch-dialog').exists()).toBe(true)

      // 批次跑完 → 关掉面板 → 再点「批量升级」：重新进入选择模式，不回放上一批的面板。
      await vi.advanceTimersByTimeAsync(250 * 8 + 10)
      expect(store.batchRunning).toBe(false)
      await wrapper.find('.batch-dialog .icon-button').trigger('click')
      await nextTick()
      // 上一批全部成功：按钮回到原先干净的「批量升级」，不留"上次批次 · 成功"角标。
      expect(store.batchStats.total).toBe(2)
      expect(wrapper.find('.toolbar .batch-entry').text()).toContain('批量升级')
      expect(wrapper.find('.toolbar .batch-entry').text()).not.toContain('上次批次')
      await wrapper.find('.toolbar .batch-entry').trigger('click')
      await nextTick()
      expect(wrapper.find('.batch-dialog').exists()).toBe(false)
      expect(wrapper.findAll('.ota-check')).toHaveLength(store.devices.length)

      // 重新勾选上一批已升过的设备，再关掉上传固件弹窗：仍留在选择模式，勾选不丢。
      await boxOf(lights[0]!.id).setValue(true)
      await nextTick()
      await wrapper.find('.batch-actions .primary-button').trigger('click')
      await nextTick()
      expect(wrapper.find('.confirm-dialog').exists()).toBe(true)
      await wrapper.find('.confirm-footer .ghost-button').trigger('click')
      await nextTick()
      expect(wrapper.find('.confirm-dialog').exists()).toBe(false)
      expect(wrapper.find('.batch-dialog').exists()).toBe(false)
      expect(wrapper.findAll('.ota-check')).toHaveLength(store.devices.length)
      expect(wrapper.find('.batch-actions .count-tag').text()).toContain('已选 1 台')
    } finally {
      vi.useRealTimers()
    }
  })

  it('routes a failed batch through the panel and asks for confirmation before the next one', async () => {
    await router.push('/ota')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const lights = store.devices.filter(
      (device) => device.type === 'light' && store.canUpgrade(device),
    )

    vi.useFakeTimers()
    try {
      store.otaFault = 'write'
      store.requestUpgradeMany([lights[0]!, lights[1]!])
      store.confirmUpgrade({
        name: '2030网关固件V2.5.0',
        fileName: '2030网关固件V2.5.0.bin',
        version: 'v2.5.0',
      })
      await nextTick()
      await vi.advanceTimersByTimeAsync(250 * 8 + 10)
      await wrapper.find('.batch-dialog .icon-button').trigger('click')
      await nextTick()

      // 两台的都失败了：角标留下"上次批次 · 失败 2"，提醒这里还有没搞定的事。
      const entry = wrapper.find('.toolbar .batch-entry')
      expect(entry.text()).toContain('上次批次')
      expect(entry.text()).toContain('失败 2')

      // 有失败时按钮先进面板（而不是直接进下一批），面板里的"下一批"入口此时可用。
      await entry.trigger('click')
      await nextTick()
      expect(wrapper.find('.batch-dialog').exists()).toBe(true)
      expect(wrapper.findAll('.ota-check')).toHaveLength(0)
      const nextBatch = wrapper
        .findAll('.batch-dialog .confirm-footer button')
        .find((button) => button.text().includes('进入下一批升级'))!
      expect((nextBatch.element as HTMLButtonElement).disabled).toBe(false)

      // 还有 2 台没升上去：点「进入下一批升级」先弹人为确认，写清台数与去向。
      await nextBatch.trigger('click')
      await nextTick()
      const confirm = wrapper.find('.batch-confirm-backdrop')
      expect(confirm.exists()).toBe(true)
      expect(confirm.text()).toContain('上一批还有设备没升上去')
      expect(confirm.text()).toContain('失败 2 台')

      // 默认「先去重试」：只收起确认层，留在面板里，不带走任何升级动作。
      await confirm.find('.primary-button').trigger('click')
      await nextTick()
      expect(wrapper.find('.batch-confirm-backdrop').exists()).toBe(false)
      expect(wrapper.find('.batch-dialog').exists()).toBe(true)
      expect(wrapper.findAll('.ota-check')).toHaveLength(0)

      // 坚持跳过：确认后收起面板，进入下一批的勾选模式。
      await nextBatch.trigger('click')
      await nextTick()
      await wrapper.find('.batch-confirm-backdrop .ghost-button').trigger('click')
      await nextTick()
      expect(wrapper.find('.batch-dialog').exists()).toBe(false)
      expect(wrapper.findAll('.ota-check')).toHaveLength(store.devices.length)
      expect(wrapper.find('.batch-actions .count-tag').text()).toContain('已选 0 台')
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a batch that mixes device types and skips devices that can no longer upgrade', () => {
    const store = useGatewayStore(createPinia())
    const upgradeable = store.devices.filter((device) => store.canUpgrade(device))
    const light = upgradeable.find((device) => device.type === 'light')!
    const ac = upgradeable.find((device) => device.type === 'ac')!
    const offlineLight = store.devices.find((device) => device.type === 'light' && !device.online)!

    // 类型不同直接拒绝，不会打开上传固件弹窗。
    store.requestUpgradeMany([light, ac])
    expect(store.pendingUpgrade).toHaveLength(0)
    expect(store.toastMessage).toBe('批量升级仅支持同一类型设备')

    // 同类型可提交；勾选期间掉线的设备在提交瞬间被跳过。
    store.requestUpgradeMany([light, offlineLight])
    expect(store.pendingUpgrade.map((device) => device.id)).toEqual([light.id])
    expect(store.toastMessage).toBe('已跳过 1 台当前不可升级的设备')

    // 选中的设备全都不可升级时给出提示，同样不进入弹窗。
    store.dismissUpgrade()
    store.requestUpgradeMany([offlineLight])
    expect(store.pendingUpgrade).toHaveLength(0)
    expect(store.toastMessage).toBe('所选设备当前都不可升级')
  })

  it('shows exactly one row per device in the log center, with its newest log', async () => {
    await router.push('/logs')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)

    // 设备数就是行数：同一台设备的旧日志不再平铺，各设备按最新日志时间倒序。
    expect(store.deviceLogs).toHaveLength(store.devices.length)
    const rows = wrapper.findAll('.table-panel tbody tr')
    expect(rows).toHaveLength(store.devices.length)
    expect(wrapper.find('.toolbar .count-tag').text()).toContain(
      `共 ${store.devices.length} 台设备`,
    )

    rows.forEach((row, index) => {
      const { device, log } = store.deviceLogs[index]!
      expect(log).toEqual(latestLogOf(device))
      const cells = row.findAll('td')
      expect(cells.map((cell) => cell.text())).toEqual([
        log.time,
        device.room,
        device.name,
        log.level,
        log.message,
        '查看以往日志',
      ])
    })

    // 以 301 主灯为例：只有一行，且描述是最新那条，不是几条历史一起铺开。
    const target = store.devices.find((device) => device.id === '301-light')!
    const latest = latestLogOf(target)!
    const roomRows = rows.filter((row) => row.text().includes('301'))
    expect(roomRows).toHaveLength(
      store.devices.filter((device) => device.room === target.room).length,
    )
    const targetRow = roomRows.find((row) => row.text().includes(target.name))!
    expect(targetRow.findAll('td')[4]!.text()).toBe(latest.message)
    expect(targetRow.find('.text-button').exists()).toBe(true)

    // 工具栏：房间号搜索排在最前，其后是设备类型与级别；楼层筛选已去掉。
    const labels = wrapper.findAll('.toolbar label')
    expect(labels.map((label) => label.text().split(/\s/)[0])).toEqual([
      '房间号',
      '设备类型',
      '级别',
    ])
    expect(wrapper.find('.toolbar').text()).not.toContain('楼层')
    const roomSearch = wrapper.find('.log-room-search input')
    expect(roomSearch.attributes('placeholder')).toBe('如 803')

    // 空结果时会多渲染一行提示，按「有单元格内容的行」计数。
    const dataRows = () =>
      wrapper.findAll('.table-panel tbody tr').filter((row) => row.findAll('td').length > 1)

    // 房间号：按房间号子串匹配，筛选同样作用在「每台设备最新一条」上。
    await roomSearch.setValue(target.room)
    await flushPromises()
    expect(dataRows()).toHaveLength(
      store.deviceLogs.filter((row) => row.device.room.includes(target.room)).length,
    )

    // 设备类型：选项取自设备元数据，与房间号叠加生效。
    const typeFilter = labels[1]!.find('select')
    expect(typeFilter.findAll('option').map((option) => option.text())).toEqual([
      '全部类型',
      ...Object.values(store.deviceMeta).map((meta) => meta.label),
    ])
    await typeFilter.setValue('light')
    await flushPromises()
    expect(dataRows()).toHaveLength(
      store.deviceLogs.filter(
        (row) => row.device.room.includes(target.room) && row.device.type === 'light',
      ).length,
    )

    const levelFilter = labels[2]!.find('select')
    await levelFilter.setValue('ERROR')
    await flushPromises()
    const expectedCombined = store.deviceLogs.filter(
      (row) =>
        row.device.room.includes(target.room) &&
        row.device.type === 'light' &&
        row.log.level === 'ERROR',
    )
    expect(dataRows()).toHaveLength(expectedCombined.length)
    expect(wrapper.find('.toolbar .count-tag').text()).toContain(
      `共 ${expectedCombined.length} 台设备`,
    )

    // 搜索框只查房间号：日志描述里的文字不再参与匹配。
    await roomSearch.setValue('指令执行失败')
    await flushPromises()
    expect(dataRows()).toHaveLength(0)
  })

  it('opens past logs for one device and queries them by date range', async () => {
    await router.push('/logs')
    await router.isReady()
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    const store = useGatewayStore(pinia)
    const target = store.devices.find((device) => device.id === '301-light')!

    expect(wrapper.find('.log-history-dialog').exists()).toBe(false)
    const targetRow = wrapper
      .findAll('.table-panel tbody tr')
      .find((row) => row.text().includes(target.room) && row.text().includes(target.name))!
    await targetRow.find('.text-button').trigger('click')
    await nextTick()

    const dialog = wrapper.find('.log-history-dialog')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain(`${target.room} · ${target.name} · 以往日志`)

    // 默认查最近 7 天：这台设备的历史日志（多日）都在区间里，一条不少。
    const dates = target.logs.map((log) => log.at.slice(0, 10))
    const newest = dates.reduce((left, right) => (left > right ? left : right))
    const oldest = dates.reduce((left, right) => (left < right ? left : right))
    const sevenDaysAgo = dayjs(newest).subtract(6, 'day').format('YYYY-MM-DD')
    const expectedDefault = logsInDateRange(target.logs, sevenDaysAgo, newest)
    expect(dialog.findAll('tbody tr')).toHaveLength(expectedDefault.length)
    expect(dialog.text()).toContain(`共 ${expectedDefault.length} 条`)
    // 弹窗里给出完整时间戳，便于和在网关侧核对。
    expect(dialog.find('tbody tr td').text()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

    // 按日期查询：只留某一天，条数与直接按日期过滤一致。
    const dateInputs = dialog.findAll('input[type="date"]')
    expect(dateInputs).toHaveLength(2)
    const day = newest
    const expectedDay = logsInDateRange(target.logs, day, day)
    await dateInputs[0]!.setValue(day)
    await dateInputs[0]!.trigger('change')
    await dateInputs[1]!.setValue(day)
    await dateInputs[1]!.trigger('change')
    expect(dialog.findAll('tbody tr')).toHaveLength(expectedDay.length)
    expect(dialog.text()).toContain(`共 ${expectedDay.length} 条`)
    for (const row of dialog.findAll('tbody tr')) {
      expect(row.find('td').text().startsWith(day)).toBe(true)
    }

    // 起点晚于终点时无法查询，起点会自动带上终点，避免筛出空结果。
    await dateInputs[0]!.setValue('2099-01-01')
    await dateInputs[0]!.trigger('change')
    expect((dateInputs[1]!.element as HTMLInputElement).value).toBe('2099-01-01')
    expect(dialog.findAll('tbody tr')).toHaveLength(0)
    expect(dialog.text()).toContain('所选日期范围内没有日志记录')

    // 「全部」= 该设备记录的最早 ~ 最新：历史记录全部列出，起止框仍是具体日期，
    // 不会退化成浏览器原生的 yyyy/mm 空占位。
    const allPreset = dialog.findAll('.chip').find((chip) => chip.text() === '全部')!
    await allPreset.trigger('click')
    await nextTick()
    expect(dialog.findAll('tbody tr')).toHaveLength(target.logs.length)
    expect((dateInputs[0]!.element as HTMLInputElement).value).toBe(oldest)
    expect((dateInputs[1]!.element as HTMLInputElement).value).toBe(newest)
    expect(dialog.find('.log-history-summary').text()).toBe(
      `全部时间范围（${oldest} ~ ${newest}）共 ${target.logs.length} 条`,
    )

    // 清除单侧（原生 × 或删空）= 放开这一侧：回落该侧边界，输入框不会留空。
    await dateInputs[0]!.setValue('')
    await dateInputs[0]!.trigger('change')
    expect((dateInputs[0]!.element as HTMLInputElement).value).toBe(oldest)
    await dateInputs[1]!.setValue('')
    await dateInputs[1]!.trigger('change')
    expect((dateInputs[1]!.element as HTMLInputElement).value).toBe(newest)
    expect(dialog.findAll('tbody tr')).toHaveLength(target.logs.length)

    await dialog.find('.confirm-footer .ghost-button').trigger('click')
    await nextTick()
    expect(wrapper.find('.log-history-dialog').exists()).toBe(false)
  })
})
