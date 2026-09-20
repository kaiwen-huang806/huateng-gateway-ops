// 登录页 2.5D 插画的等距几何。
//
// 场景按标准等距投影（轴测 30°）搭建：世界坐标的「右轴」投影到屏幕 (0.866, -0.5)，
// 「左轴」投影到 (-0.866, -0.5)，竖直方向保持 (0, 1)。
//
// 所有形体都由 isoBox() 推导，不要在模板里手写多边形——改尺寸时只动这里的数字，
// 顶面 / 左右侧面 / 棱线会自动跟着变，不会出现某个面没对齐的情况。

const RX = 0.8660254
const RY = -0.5
const LX = -0.8660254
const LY = -0.5

type Pt = [number, number]

const round = (n: number) => Math.round(n * 10) / 10
const points = (pts: Pt[]) => pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')
const path = (pts: Pt[], close = true) =>
  `M${pts.map(([x, y]) => `${round(x)},${round(y)}`).join('L')}${close ? 'Z' : ''}`

export interface IsoBox {
  /** 顶面多边形（points 属性） */
  top: string
  /** 右侧面（朝右下，受光较暗） */
  right: string
  /** 左侧面 */
  left: string
  /** 顶面轮廓路径，用于铺贴花或被 clipPath 裁切 */
  outline: string
  /** 只画可见棱线的线框版本 */
  edges: string
  /** 顶面中心：贴花、光效的锚点 */
  center: Pt
  /** 前顶点：左右两个侧面的公共起点 */
  front: Pt
  /** 顶面外接矩形 [x0, y0, x1, y1] */
  bounds: [number, number, number, number]
}

/**
 * 生成一个等距长方体。(cx, cy) 是顶面中心，h 为向下延伸的高度。
 * 需要「立在地面上」的柱子时，把底面点 P 传成 isoBox(P.x, P.y - h, ..., h)。
 */
export function isoBox(cx: number, cy: number, a: number, b: number, h: number): IsoBox {
  const ox = cx - (a * RX + b * LX) / 2
  const oy = cy - (a * RY + b * LY) / 2
  const O: Pt = [ox, oy]
  const A: Pt = [ox + a * RX, oy + a * RY]
  const C: Pt = [ox + b * LX, oy + b * LY]
  const B: Pt = [A[0] + b * LX, A[1] + b * LY]
  const down = ([x, y]: Pt): Pt => [x, y + h]
  const O2 = down(O)
  const A2 = down(A)
  const C2 = down(C)

  const xs = [O[0], A[0], B[0], C[0]]
  const ys = [O[1], A[1], B[1], C[1]]

  return {
    top: points([O, A, B, C]),
    right: points([O, A, A2, O2]),
    left: points([O, C, C2, O2]),
    outline: path([O, A, B, C]),
    edges:
      path([O, A, B, C]) +
      path([O, O2], false) +
      path([A, A2], false) +
      path([C, C2], false) +
      path([O2, A2], false) +
      path([O2, C2], false),
    center: [round(cx), round(cy)],
    front: [round(ox), round(oy)],
    bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  }
}

export interface IsoCylinder {
  /** 柱身（含底部半椭圆） */
  body: string
  /** 顶部椭圆 */
  cap: string
}

/** 等距圆柱：地面上的圆投影成 rx=1.2247r、ry=0.7071r 的椭圆。 */
export function isoCylinder(cx: number, baseY: number, r: number, h: number): IsoCylinder {
  const rx = round(r * 1.2247)
  const ry = round(r * 0.7071)
  const top = baseY - h
  return {
    body: `M${round(cx - rx)},${round(top)}V${round(baseY)}A${rx},${ry} 0 0 0 ${round(cx + rx)},${round(baseY)}V${round(top)}Z`,
    cap: `M${round(cx - rx)},${round(top)}A${rx},${ry} 0 0 1 ${round(cx + rx)},${round(top)}A${rx},${ry} 0 0 1 ${round(cx - rx)},${round(top)}Z`,
  }
}

/** 把顶面上 (u, v) 的局部坐标换算成屏幕坐标，用来在平面上摆东西。 */
export function onPlane(center: Pt, u: number, v: number): Pt {
  return [center[0] + u * RX + v * LX, center[1] + u * RY + v * LY]
}

// 场景元素

/** 底座平台：整簇设备都站在它上面 */
export const platform = isoBox(410, 600, 470, 320, 24)

/** 平铺在平台上的深蓝面板（点阵屏） */
export const tablet = isoBox(470, 552, 150, 110, 0)

/** 青蓝发光面板 */
export const glowPanel = isoBox(556, 526, 118, 88, 0)

/** 服务器机柜：站在平台前沿，是整簇里最靠前的实体 */
export const rack = isoBox(466, 620, 112, 82, 74)

/** 左侧两枚方块：一枚带齿轮标记，一枚是普通计算单元 */
export const cubeGear = isoBox(238, 612, 70, 52, 46)
export const cubeChip = isoBox(332, 548, 56, 42, 36)

/** 青蓝面板上站立的数据柱：高度不同，读起来像实时负载 */
const COLUMN_HEIGHTS = [30, 52, 40, 64, 46]
export const glowColumns = COLUMN_HEIGHTS.map((height, index) => {
  const [x, y] = onPlane(glowPanel.center, -44 + index * 22, 12)
  return isoBox(x, y - height, 18, 14, height)
})

/** 背景线框塔：不带实体填充，只勾棱线。塔身单独具名，便于给某几座加淡填充。 */
export const wireTowerCenter = isoBox(990, 150, 100, 100, 190)
export const wireTowerRight = isoBox(1386, 300, 88, 88, 236)
export const wireTowerFront = isoBox(520, 806, 82, 82, 168)
export const wireTowerFar = isoBox(1400, 610, 68, 68, 190)
export const wireTowers = [wireTowerCenter, wireTowerRight, wireTowerFront, wireTowerFar]

/** 平台顶面上的等距网格：先裁到外接矩形，再由 clipPath 精确裁到菱形。 */
function clipToBox(p0: Pt, p1: Pt, box: [number, number, number, number]): string | null {
  const [x0, y0, x1, y1] = box
  let t0 = 0
  let t1 = 1
  const dx = p1[0] - p0[0]
  const dy = p1[1] - p0[1]
  const tests: [number, number][] = [
    [-dx, p0[0] - x0],
    [dx, x1 - p0[0]],
    [-dy, p0[1] - y0],
    [dy, y1 - p0[1]],
  ]
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }
  const at = (t: number) => [p0[0] + dx * t, p0[1] + dy * t] as Pt
  return path([at(t0), at(t1)], false)
}

function gridFamily(
  center: Pt,
  perp: Pt,
  dir: Pt,
  step: number,
  box: [number, number, number, number],
) {
  const lines: string[] = []
  for (let n = -30; n <= 30; n++) {
    const px = center[0] + perp[0] * step * n
    const py = center[1] + perp[1] * step * n
    const line = clipToBox(
      [px - dir[0] * 1600, py - dir[1] * 1600],
      [px + dir[0] * 1600, py + dir[1] * 1600],
      box,
    )
    if (line) lines.push(line)
  }
  return lines.join('')
}

export const platformGridA = gridFamily(
  platform.center,
  [0.5, -0.866],
  [RX, -RY],
  46,
  platform.bounds,
)
export const platformGridB = gridFamily(
  platform.center,
  [-0.5, -0.866],
  [LX, -LY],
  46,
  platform.bounds,
)
