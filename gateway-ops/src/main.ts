import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import './styles/global.scss'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 等首次导航落定再挂载：挂载那一刻 route 还停在起始位置，meta.public 是 undefined，
// App.vue 会先按「运维台」分支把侧边栏 / 顶栏画出来（未登录刷新登录页时能看见
// 「网关在线」闪一下）。首次导航包含守卫重定向 + 目标页懒加载分包，必须等它跑完。
router
  .isReady()
  // 首次导航失败（例如分包拉取失败）也照常挂载：宁可停在应用内的空状态，不要白屏。
  .catch(() => {})
  .then(() => app.mount('#app'))
