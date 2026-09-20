<script setup lang="ts">
// 登录页背景插画：左侧一整簇 2.5D 等距物联网设备（数据大屏 / 点阵面板 / 发光算力板 /
// 服务器机柜 / 传感器立柱），四周散落线框塔、节点网络与光斑。
//
// 所有形体的几何都来自 ./loginScene（等距投影推导），这里只负责配色、层次与动效。
// 绘制顺序按「屏幕 y 越大越靠前」排列，保证前后遮挡关系正确。
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import {
  cubeChip,
  cubeGear,
  glowColumns,
  glowPanel,
  isoCylinder,
  platform,
  platformGridA,
  platformGridB,
  rack,
  tablet,
  wireTowerCenter,
  wireTowerRight,
  wireTowers,
} from './loginScene'

// 窄屏切到左上对齐：插画簇缩进上半屏，卡片落到下半屏，两者不互相遮挡。
const isNarrow = useMediaQuery('(max-width: 760px)')
const aspectRatio = computed(() => (isNarrow.value ? 'xMinYMin slice' : 'xMidYMid slice'))

// 左侧三根传感器立柱：[x, 底面 y, 半径, 高度]
const pills = [
  { ...isoCylinder(432, 500, 13, 96), x: 432, baseY: 500, color: '#5ce6ff' },
  { ...isoCylinder(252, 700, 12, 84), x: 252, baseY: 700, color: '#54f0a6' },
  { ...isoCylinder(392, 692, 11, 72), x: 392, baseY: 692, color: '#a98bff' },
]

// 机柜左侧面的指示灯颜色
const rackLeds = ['#5ce6ff', '#54f0a6', '#ffc25c']

// 节点网络：圆点 + 连线，散布在画面四周
const netNodes = [
  { x: 1066, y: 22, r: 7 },
  { x: 1104, y: 58, r: 10 },
  { x: 1138, y: 14, r: 5 },
  { x: 62, y: 706, r: 8 },
  { x: 118, y: 752, r: 5 },
  { x: 74, y: 796, r: 10 },
  { x: 1268, y: 606, r: 6 },
  { x: 1312, y: 660, r: 10 },
  { x: 1340, y: 712, r: 7 },
  { x: 1340, y: 620, r: 5 },
  { x: 250, y: 200, r: 6 },
  { x: 292, y: 242, r: 9 },
]
const netEdges = [
  'M1066 22L1104 58L1138 14M1066 22L1138 14',
  'M62 706L118 752L74 796M62 706L74 796',
  'M1268 606L1312 660L1340 712M1312 660L1340 620',
  'M250 200L292 242',
]

// 光斑：ob 为不透明度，越大的越淡，制造景深
const orbs = [
  { x: 135, y: 300, r: 22, ob: 0.7 },
  { x: 372, y: 196, r: 7, ob: 0.8 },
  { x: 1240, y: 265, r: 26, ob: 0.6 },
  { x: 180, y: 730, r: 30, ob: 0.5 },
  { x: 316, y: 762, r: 12, ob: 0.7 },
  { x: 1428, y: 420, r: 18, ob: 0.55 },
  { x: 890, y: 690, r: 14, ob: 0.5 },
  { x: 600, y: 180, r: 9, ob: 0.6 },
]
</script>

<template>
  <svg
    class="login-scene"
    viewBox="0 0 1440 900"
    :preserveAspectRatio="aspectRatio"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <!-- 等距形体的三面受光：顶面最亮，右侧面最暗 -->
      <linearGradient id="lx-face-top" x1="0" y1="0" x2=".45" y2="1">
        <stop offset="0" stop-color="#f2f7ff" />
        <stop offset="1" stop-color="#b3cdf5" />
      </linearGradient>
      <linearGradient id="lx-face-left" x1="0" y1="0" x2=".25" y2="1">
        <stop offset="0" stop-color="#9dbdf0" />
        <stop offset="1" stop-color="#6d8ed6" />
      </linearGradient>
      <linearGradient id="lx-face-right" x1="0" y1="0" x2=".3" y2="1">
        <stop offset="0" stop-color="#4a6cc0" />
        <stop offset="1" stop-color="#31488f" />
      </linearGradient>

      <!-- 底座平台：半透明玻璃感 -->
      <linearGradient id="lx-plate" x1="0" y1="0" x2=".6" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".3" />
        <stop offset="1" stop-color="#8fb9ff" stop-opacity=".14" />
      </linearGradient>
      <linearGradient id="lx-plate-side" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7ea6f0" stop-opacity=".5" />
        <stop offset="1" stop-color="#3f5fc0" stop-opacity=".35" />
      </linearGradient>

      <!-- 深蓝点阵面板 / 青蓝算力板 -->
      <linearGradient id="lx-navy" x1="0" y1="0" x2=".5" y2="1">
        <stop offset="0" stop-color="#1d2f6d" />
        <stop offset="1" stop-color="#0d1740" />
      </linearGradient>
      <linearGradient id="lx-cyan" x1="0" y1="0" x2=".6" y2="1">
        <stop offset="0" stop-color="#8df3ff" />
        <stop offset="1" stop-color="#17a4e4" />
      </linearGradient>
      <pattern
        id="lx-dots"
        width="26"
        height="26"
        patternUnits="userSpaceOnUse"
        patternTransform="matrix(.866 .5 -.866 .5 0 0)"
      >
        <circle cx="0" cy="0" r="2.6" fill="#9fdcff" fill-opacity=".55" />
      </pattern>

      <!-- 数据大屏 -->
      <linearGradient id="lx-screen" x1="0" y1="0" x2=".4" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="1" stop-color="#e6f0ff" />
      </linearGradient>
      <linearGradient id="lx-chart" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2f6bff" stop-opacity=".35" />
        <stop offset="1" stop-color="#2f6bff" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="lx-violet" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a06bff" />
        <stop offset="1" stop-color="#7b46e8" />
      </linearGradient>

      <!-- 云与立柱 -->
      <linearGradient id="lx-cloud" x1="0" y1="0" x2=".3" y2="1">
        <stop offset="0" stop-color="#8ff5e2" />
        <stop offset="1" stop-color="#22c2d8" />
      </linearGradient>
      <linearGradient id="lx-pill" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".55" />
        <stop offset=".5" stop-color="#ffffff" stop-opacity=".95" />
        <stop offset="1" stop-color="#c3d8f7" stop-opacity=".7" />
      </linearGradient>

      <!-- 环境光与光斑 -->
      <radialGradient id="lx-glow-cyan">
        <stop offset="0" stop-color="#6fe8ff" stop-opacity=".5" />
        <stop offset="1" stop-color="#6fe8ff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="lx-glow-violet">
        <stop offset="0" stop-color="#a98bff" stop-opacity=".42" />
        <stop offset="1" stop-color="#a98bff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="lx-glow-blue">
        <stop offset="0" stop-color="#7fb8ff" stop-opacity=".4" />
        <stop offset="1" stop-color="#7fb8ff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="lx-orb">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".85" />
        <stop offset=".55" stop-color="#cfe6ff" stop-opacity=".3" />
        <stop offset="1" stop-color="#cfe6ff" stop-opacity="0" />
      </radialGradient>

      <clipPath id="lx-clip-platform">
        <path :d="platform.outline" />
      </clipPath>
    </defs>

    <!-- 环境光 -->
    <g class="lx-glow">
      <circle cx="420" cy="560" r="360" fill="url(#lx-glow-cyan)" />
      <circle cx="880" cy="120" r="320" fill="url(#lx-glow-violet)" />
      <circle cx="1210" cy="790" r="330" fill="url(#lx-glow-blue)" />
    </g>

    <!-- 背景线框塔 -->
    <g
      class="lx-wire"
      fill="none"
      stroke="#d9e9ff"
      stroke-opacity=".26"
      stroke-width="1.2"
      stroke-linejoin="round"
    >
      <path v-for="(tower, index) in wireTowers" :key="index" :d="tower.edges" />
    </g>
    <polygon :points="wireTowerCenter.top" fill="#dce9ff" fill-opacity=".07" />
    <polygon :points="wireTowerRight.top" fill="#dce9ff" fill-opacity=".05" />

    <!-- 节点网络 -->
    <g
      class="lx-net"
      fill="none"
      stroke="#e2f0ff"
      stroke-opacity=".4"
      stroke-width="1.1"
      stroke-dasharray="5 9"
    >
      <path
        v-for="(edge, index) in netEdges"
        :key="index"
        class="lx-flow"
        :d="edge"
        :style="{ animationDelay: `${index * 0.8}s` }"
      />
    </g>
    <g fill="#eaf4ff">
      <circle
        v-for="(node, index) in netNodes"
        :key="index"
        :cx="node.x"
        :cy="node.y"
        :r="node.r"
        fill-opacity=".5"
        stroke="#e2f0ff"
        stroke-opacity=".35"
      />
    </g>

    <!-- 背景光斑 -->
    <g>
      <circle cx="110" cy="95" r="46" fill="none" stroke="#e3f0ff" stroke-opacity=".22" />
      <circle cx="110" cy="95" r="14" fill="#ffffff" fill-opacity=".16" />
      <circle
        v-for="(orb, index) in orbs"
        :key="index"
        :cx="orb.x"
        :cy="orb.y"
        :r="orb.r"
        fill="url(#lx-orb)"
        :opacity="orb.ob"
      />
    </g>

    <!-- 底座平台 -->
    <g>
      <polygon :points="platform.left" fill="url(#lx-plate-side)" />
      <polygon :points="platform.right" fill="url(#lx-plate-side)" />
      <polygon :points="platform.top" fill="url(#lx-plate)" />
      <g clip-path="url(#lx-clip-platform)">
        <path
          :d="platformGridA"
          fill="none"
          stroke="#dcecff"
          stroke-opacity=".24"
          stroke-width="1"
        />
        <path
          :d="platformGridB"
          fill="none"
          stroke="#dcecff"
          stroke-opacity=".15"
          stroke-width="1"
        />
      </g>
      <path :d="platform.outline" fill="none" stroke="#e2efff" stroke-opacity=".35" />
    </g>

    <!-- 悬浮云 -->
    <g class="lx-float-alt">
      <ellipse cx="176" cy="358" rx="34" ry="26" fill="url(#lx-cloud)" />
      <ellipse cx="208" cy="346" rx="28" ry="24" fill="url(#lx-cloud)" />
      <ellipse cx="232" cy="360" rx="22" ry="18" fill="url(#lx-cloud)" />
      <rect x="150" y="352" width="88" height="30" rx="15" fill="url(#lx-cloud)" />
      <ellipse cx="196" cy="342" rx="26" ry="12" fill="#ffffff" fill-opacity=".28" />
    </g>

    <!-- 数据大屏：先画支架，再画屏体 -->
    <g transform="translate(190 208)">
      <g class="lx-float">
        <path
          d="M120 190L140 330"
          fill="none"
          stroke="#dbeaff"
          stroke-opacity=".45"
          stroke-width="4"
          stroke-linecap="round"
        />
        <ellipse cx="142" cy="336" rx="26" ry="11" fill="#cfe3ff" fill-opacity=".3" />
        <rect x="-12" y="8" width="14" height="182" rx="7" fill="url(#lx-violet)" />
        <rect x="0" y="0" width="220" height="196" rx="14" fill="url(#lx-screen)" />
        <path d="M0 14a14 14 0 0 1 14-14h192a14 14 0 0 1 14 14v20H0z" fill="#dbe8ff" />
        <circle cx="20" cy="17" r="3.5" fill="#ff7a8a" />
        <circle cx="32" cy="17" r="3.5" fill="#ffc86b" />
        <circle cx="44" cy="17" r="3.5" fill="#5ce6a8" />
        <rect x="150" y="11" width="56" height="12" rx="6" fill="#3d78ff" />

        <rect x="14" y="48" width="120" height="134" rx="10" fill="#f2f7ff" />
        <path d="M22 84H126M22 114H126M22 144H126" stroke="#dbe6f7" stroke-width="1" />
        <path
          d="M22 162L38 132L54 146L70 106L86 122L102 88L118 96L118 172H22Z"
          fill="url(#lx-chart)"
        />
        <path
          d="M22 162L38 132L54 146L70 106L86 122L102 88L118 96"
          fill="none"
          stroke="#2f6bff"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle cx="102" cy="88" r="3.5" fill="#ffffff" stroke="#2f6bff" stroke-width="2.5" />

        <rect x="146" y="48" width="60" height="28" rx="8" fill="#d9e8ff" />
        <rect x="146" y="84" width="60" height="28" rx="8" fill="#cdefff" />
        <rect x="146" y="120" width="60" height="28" rx="8" fill="#ffe0ee" />
        <rect x="146" y="156" width="60" height="28" rx="8" fill="#e6e1ff" />
        <rect x="154" y="59" width="34" height="6" rx="3" fill="#ffffff" fill-opacity=".8" />
        <rect x="154" y="95" width="42" height="6" rx="3" fill="#ffffff" fill-opacity=".8" />
        <rect x="154" y="131" width="28" height="6" rx="3" fill="#ffffff" fill-opacity=".8" />
        <rect x="154" y="167" width="38" height="6" rx="3" fill="#ffffff" fill-opacity=".8" />
      </g>
    </g>

    <!-- 传感器立柱（后排） -->
    <g v-for="(pill, index) in pills.slice(0, 1)" :key="index">
      <path :d="pill.body" fill="url(#lx-pill)" />
      <path :d="pill.cap" :fill="pill.color" />
    </g>

    <!-- 深蓝点阵面板 -->
    <g>
      <polygon :points="tablet.top" fill="url(#lx-navy)" />
      <polygon :points="tablet.top" fill="url(#lx-dots)" />
      <path :d="tablet.outline" fill="none" stroke="#8fc6ff" stroke-opacity=".45" />
    </g>

    <!-- 计算单元 -->
    <g>
      <polygon :points="cubeChip.left" fill="url(#lx-face-left)" />
      <polygon :points="cubeChip.right" fill="url(#lx-face-right)" />
      <polygon :points="cubeChip.top" fill="url(#lx-face-top)" />
      <g :transform="`matrix(.866 .5 -.866 .5 ${cubeChip.center[0]} ${cubeChip.center[1]})`">
        <rect x="-14" y="-9" width="28" height="18" rx="5" fill="#2f6bff" fill-opacity=".85" />
      </g>
    </g>

    <!-- 青蓝算力板与数据柱 -->
    <g>
      <ellipse
        :cx="glowPanel.center[0]"
        :cy="glowPanel.center[1]"
        rx="160"
        ry="76"
        fill="url(#lx-glow-cyan)"
      />
      <polygon :points="glowPanel.top" fill="url(#lx-cyan)" fill-opacity=".92" />
      <path :d="glowPanel.outline" fill="none" stroke="#dcfbff" stroke-opacity=".8" />
    </g>
    <g v-for="(column, index) in glowColumns" :key="index">
      <polygon :points="column.left" fill="#bff4ff" fill-opacity=".7" />
      <polygon :points="column.right" fill="#5fd2f5" fill-opacity=".85" />
      <polygon :points="column.top" fill="#ffffff" fill-opacity=".92" />
    </g>

    <!-- 带齿轮标记的方块 -->
    <g>
      <polygon :points="cubeGear.left" fill="url(#lx-face-left)" />
      <polygon :points="cubeGear.right" fill="url(#lx-face-right)" />
      <polygon :points="cubeGear.top" fill="url(#lx-face-top)" />
      <g :transform="`matrix(.866 .5 -.866 .5 ${cubeGear.center[0]} ${cubeGear.center[1]})`">
        <circle cx="0" cy="0" r="19" fill="#ffffff" fill-opacity=".9" />
        <circle
          cx="0"
          cy="0"
          r="15"
          fill="none"
          stroke="#2f6bff"
          stroke-opacity=".55"
          stroke-width="5"
          stroke-dasharray="3 4"
        />
        <circle cx="0" cy="0" r="7" fill="#2f6bff" />
      </g>
    </g>

    <!-- 服务器机柜 -->
    <g>
      <polygon :points="rack.left" fill="url(#lx-face-left)" />
      <polygon :points="rack.right" fill="url(#lx-face-right)" />
      <polygon :points="rack.top" fill="url(#lx-face-top)" />
      <g :transform="`matrix(.866 -.5 0 1 ${rack.front[0]} ${rack.front[1]})`">
        <rect
          v-for="index in 5"
          :key="index"
          x="14"
          :y="12 + (index - 1) * 13"
          width="84"
          height="7"
          rx="3.5"
          fill="#dbe8ff"
          fill-opacity=".28"
        />
      </g>
      <g :transform="`matrix(-.866 -.5 0 1 ${rack.front[0]} ${rack.front[1]})`">
        <circle
          v-for="(led, index) in rackLeds"
          :key="index"
          :cx="20 + index * 22"
          cy="26"
          r="4"
          :fill="led"
        />
      </g>
    </g>

    <!-- 传感器立柱（前排） -->
    <g v-for="(pill, index) in pills.slice(1)" :key="index">
      <path :d="pill.body" fill="url(#lx-pill)" />
      <path :d="pill.cap" :fill="pill.color" />
      <ellipse :cx="pill.x" :cy="pill.baseY" rx="15" ry="7" fill="#1c3570" fill-opacity=".18" />
    </g>

    <!-- 前景光斑 -->
    <circle cx="1400" cy="150" r="34" fill="url(#lx-orb)" opacity=".45" class="lx-float-alt" />
  </svg>
</template>
