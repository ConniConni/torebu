// 部位ハイライトSVGの描画ロジック。
// 別プロジェクト（`/Users/koni/Desktop/ClaudeCode/筋トレ部位紐付け/muscle_highlight_proto.html`）
// のプロトタイプをVue向けに移植したもの。プロトタイプは素のDOM操作（document.createElementNS等）で
// 発光表現・ゾーン塗り分け・ラベル配置を実装しており、ブラウザ標準APIなのでVue環境でもそのまま動く
// （経緯はdocs/muscle-highlight.md、決定経緯の詳細は元プロジェクトのdecision_log.md 31〜42節参照）。
//
// torebuは常時ライト背景のUIのため、プロトタイプのダーク/ライト切替のうちライト用パラメータのみを移植した
// （ダーク/ライト・男性/女性図の切替はPhase2のスコープ外。docs/muscle-highlight.md参照）。
import bodySvgData from '~/assets/data/muscle-body-svg.json'
import type { MuscleZone, SlugZone } from '~/utils/muscleSlugs'

const SVG_NS = 'http://www.w3.org/2000/svg'

interface SvgPart {
  slug: string
  path: { common?: string[]; left?: string[]; right?: string[] }
}

interface BodySvgData {
  front: SvgPart[]
  back: SvgPart[]
  outlineFront: string
  outlineBack: string
  viewBox: { front: string; back: string }
}

export const BODY_SVG_DATA = bodySvgData as BodySvgData

export const FRONT_SLUGS = new Set(
  BODY_SVG_DATA.front.map((p) => p.slug).filter((s) => s !== 'hair' && s !== 'head'),
)
export const BACK_SLUGS = new Set(
  BODY_SVG_DATA.back.map((p) => p.slug).filter((s) => s !== 'hair' && s !== 'head'),
)

// ライト背景（13節・41節で確立したパラメータ）
const COLORS = { glow: '255 94 58', base: '214 211 209' }

const I_MAIN = 1.0
// パターン1：主働筋のうちゾーン以外の部分・関連筋は同じ明るさ(フラット)にする
const I_FLAT = 0.75
const I_DEFAULT = 0

interface ZoneGradientDef {
  cy: string
  r: string
  squashX: number
}

// ゾーンごとの発光の重心位置（上部/中部/下部などの違いを光り方の差として見せる）
const ZONE_GRADIENT: Partial<Record<MuscleZone, ZoneGradientDef>> = {
  upper: { cy: '22%', r: '32%', squashX: 1.8 },
  mid: { cy: '45%', r: '32%', squashX: 1.8 },
  lower: { cy: '78%', r: '32%', squashX: 1.8 },
}

export const ZONE_LABEL: Partial<Record<MuscleZone, string>> = {
  upper: '上部',
  mid: '中部',
  lower: '下部',
  front: '前部',
  lateral: '側部',
  back: '後部',
  // lat/upper_backはmain_muscle自体(広背筋/上背部)が区別を表すため表示への追加語は付けない
}

// 背中(upper-back)のように元々複数本に分かれている部分パスをそのまま出し分けるゾーン。
// 「広背筋」「上背部」はSVGライブラリ上どちらもupper-backスラッグしか無いための代替措置
const ZONE_SUBPATH_GROUPS: Record<string, Partial<Record<MuscleZone, number[]>>> = {
  'upper-back': {
    lat: [2], // 一番下・一番大きい「広背筋の羽」の部分パス
    upper_back: [0, 1], // 肩甲骨まわりの上側2本の部分パス
  },
}

// 三角筋(deltoids)の前部/側部/後部：前部・後部は反対側の主表示を間引いてFRONT/BACK片方に絞る
const MAIN_FRONT_ONLY_ZONE: Partial<Record<string, MuscleZone>> = { deltoids: 'front' }
const MAIN_BACK_ONLY_ZONE: Partial<Record<string, MuscleZone>> = { deltoids: 'back' }

// 僧帽筋・上腕三頭筋はFRONT/BACK両方にパスを持つが、主働筋の主表示は1箇所(BACK)に絞る
const MAIN_ONLY_BACK_SLUGS = new Set(['trapezius', 'triceps'])

// ラベルを図の上/右どちらに出すか。胴体に近い正中寄りの筋肉は上、手足など左右に離れる筋肉は右
const LABEL_ABOVE = new Set(['chest', 'trapezius', 'upper-back', 'lower-back', 'gluteal', 'abs', 'obliques'])

function glowStyle(i: number) {
  // 白背景ではぼかしを強く出すと汚れて見えるため、ドロップシャドウは軽く抑え、塗りの彩度・不透明度で表現する
  return {
    fillOpacity: 0.28 + i * 0.68,
    glowRadius: 1 + i * 5,
    glowAlpha: i * 0.28,
  }
}

function makeGradient(
  defs: SVGDefsElement,
  id: string,
  i: number,
  pos?: { cx?: string; cy?: string; r?: string; squashX?: number; squashY?: number },
): number {
  const { fillOpacity } = glowStyle(i)
  const grad = document.createElementNS(SVG_NS, 'radialGradient')
  grad.setAttribute('id', id)
  const cx = pos?.cx ?? '50%'
  const cy = pos?.cy ?? '45%'
  grad.setAttribute('cx', cx)
  grad.setAttribute('cy', cy)
  grad.setAttribute('r', pos?.r ?? '65%')
  if (pos?.squashX || pos?.squashY) {
    const cxFrac = Number.parseFloat(cx) / 100
    const cyFrac = Number.parseFloat(cy) / 100
    const sx = pos.squashX ?? 1
    const sy = pos.squashY ?? 1
    grad.setAttribute(
      'gradientTransform',
      `translate(${cxFrac}, ${cyFrac}) scale(${sx}, ${sy}) translate(${-cxFrac}, ${-cyFrac})`,
    )
  }

  // 中心→外側で必ず単調に暗くなるようにする
  const s0 = document.createElementNS(SVG_NS, 'stop')
  s0.setAttribute('offset', '0%')
  s0.setAttribute('stop-color', `rgb(${COLORS.glow})`)
  s0.setAttribute('stop-opacity', (i * 0.95).toFixed(3))

  const s1 = document.createElementNS(SVG_NS, 'stop')
  s1.setAttribute('offset', '50%')
  s1.setAttribute('stop-color', `rgb(${COLORS.glow})`)
  s1.setAttribute('stop-opacity', (i * 0.5).toFixed(3))

  const s2 = document.createElementNS(SVG_NS, 'stop')
  s2.setAttribute('offset', '100%')
  s2.setAttribute('stop-color', `rgb(${COLORS.base})`)
  s2.setAttribute('stop-opacity', Math.max(i * 0.15, 0.1).toFixed(3))

  grad.append(s0, s1, s2)
  defs.appendChild(grad)
  return fillOpacity
}

function paintGlowPath(
  svgEl: SVGSVGElement,
  defs: SVGDefsElement,
  d: string,
  gradIdBase: string,
  i: number,
  pos?: { cx?: string; cy?: string; r?: string; squashX?: number; squashY?: number },
) {
  const fillOpacity = makeGradient(defs, gradIdBase, i, pos)
  const { glowRadius, glowAlpha } = glowStyle(i)
  const p = document.createElementNS(SVG_NS, 'path')
  p.setAttribute('d', d)
  p.setAttribute('fill', `url(#${gradIdBase})`)
  p.setAttribute('fill-opacity', fillOpacity.toFixed(3))
  p.style.filter = `drop-shadow(0 0 ${glowRadius.toFixed(1)}px rgb(${COLORS.glow} / ${glowAlpha.toFixed(3)}))`
  svgEl.appendChild(p)
  return p
}

function unionBBox(svgEl: SVGSVGElement, dArray: string[]) {
  if (!dArray.length) return null
  const temps = dArray.map((d) => {
    const p = document.createElementNS(SVG_NS, 'path')
    p.setAttribute('d', d)
    p.style.visibility = 'hidden'
    svgEl.appendChild(p)
    return p
  })
  let box: { x: number; y: number; x2: number; y2: number } | null = null
  for (const p of temps) {
    const b = p.getBBox()
    if (!box) box = { x: b.x, y: b.y, x2: b.x + b.width, y2: b.y + b.height }
    else {
      box.x = Math.min(box.x, b.x)
      box.y = Math.min(box.y, b.y)
      box.x2 = Math.max(box.x2, b.x + b.width)
      box.y2 = Math.max(box.y2, b.y + b.height)
    }
  }
  temps.forEach((p) => svgEl.removeChild(p))
  if (!box) return null
  return { x: box.x, y: box.y, width: box.x2 - box.x, height: box.y2 - box.y }
}

function sortPathsByBBoxY(svgEl: SVGSVGElement, dArray: string[]) {
  const withY = dArray.map((d) => {
    const p = document.createElementNS(SVG_NS, 'path')
    p.setAttribute('d', d)
    p.style.visibility = 'hidden'
    svgEl.appendChild(p)
    const y = p.getBBox().y
    svgEl.removeChild(p)
    return { d, y }
  })
  withY.sort((a, b) => a.y - b.y)
  return withY.map((x) => x.d)
}

interface LabelInfo {
  ja: string
  isMain: boolean
}

function addMuscleLabel(svgEl: SVGSVGElement, part: SvgPart, allPaths: string[], label: LabelInfo) {
  const isAbove = LABEL_ABOVE.has(part.slug)
  const dArray = isAbove ? allPaths : part.path.right?.length ? part.path.right : allPaths
  const box = unionBBox(svgEl, dArray)
  if (!box) return
  const text = document.createElementNS(SVG_NS, 'text')
  if (isAbove) {
    text.setAttribute('x', String(box.x + box.width / 2))
    text.setAttribute('y', String(box.y - 12))
    text.setAttribute('text-anchor', 'middle')
  } else {
    text.setAttribute('x', String(box.x + box.width + 12))
    text.setAttribute('y', String(box.y + box.height / 2))
    text.setAttribute('text-anchor', 'start')
    text.setAttribute('dominant-baseline', 'middle')
  }
  text.setAttribute('class', `muscle-label${label.isMain ? ' muscle-label-main' : ''}`)
  text.dataset.align = isAbove ? 'above' : 'side'
  text.dataset.main = label.isMain ? '1' : '0'
  text.textContent = label.ja
  svgEl.appendChild(text)
}

// 「図の上・中央」に配置するラベル同士が重なった場合、主働筋のラベルを固定し、
// 衝突する関連筋のラベルだけ上へずらして重なりを解消する
function resolveAboveLabelOverlaps(svgEl: SVGSVGElement) {
  const els = Array.from(svgEl.querySelectorAll<SVGTextElement>('text[data-align="above"]'))
  if (els.length < 2) return
  els.sort((a, b) => (b.dataset.main === '1' ? 1 : 0) - (a.dataset.main === '1' ? 1 : 0))
  const pad = 2
  const placed: DOMRect[] = []
  for (const el of els) {
    let box = el.getBBox()
    let guard = 0
    const overlaps = (b: DOMRect) =>
      !(
        box.x + box.width < b.x - pad ||
        b.x + b.width < box.x - pad ||
        box.y + box.height < b.y - pad ||
        b.y + b.height < box.y - pad
      )
    while (placed.some(overlaps) && guard < 20) {
      const y = Number.parseFloat(el.getAttribute('y') ?? '0')
      el.setAttribute('y', String(y - 16))
      box = el.getBBox()
      guard++
    }
    placed.push(box)
  }
}

export interface ZoneSpec {
  slug: string
  zone: MuscleZone
  isMain: boolean
}

export type IntensityMap = Record<string, number>
export type LabelMap = Record<string, LabelInfo>

export function buildSvg(
  svgEl: SVGSVGElement,
  parts: SvgPart[],
  outlineD: string,
  intensityMap: IntensityMap,
  zoneSpecs: ZoneSpec[],
  labelMap: LabelMap,
) {
  svgEl.innerHTML = ''

  const defs = document.createElementNS(SVG_NS, 'defs')
  svgEl.appendChild(defs)

  const outlineGroup = document.createElementNS(SVG_NS, 'g')
  outlineGroup.setAttribute('class', 'body-outline')
  const outline = document.createElementNS(SVG_NS, 'path')
  outline.setAttribute('d', outlineD)
  outlineGroup.appendChild(outline)
  svgEl.appendChild(outlineGroup)

  let gid = 0

  for (const part of parts) {
    const allPaths = [...(part.path.common ?? []), ...(part.path.left ?? []), ...(part.path.right ?? [])]

    if (part.slug === 'hair' || part.slug === 'head') {
      const g = document.createElementNS(SVG_NS, 'g')
      g.setAttribute('class', 'body-head')
      for (const d of allPaths) {
        const p = document.createElementNS(SVG_NS, 'path')
        p.setAttribute('d', d)
        g.appendChild(p)
      }
      svgEl.appendChild(g)
      continue
    }

    const zoneSpec = zoneSpecs.find((z) => z.slug === part.slug)
    const useZone =
      !!zoneSpec &&
      !!(ZONE_GRADIENT[zoneSpec.zone] || ZONE_SUBPATH_GROUPS[part.slug]?.[zoneSpec.zone])
    const subpathGroups = useZone ? ZONE_SUBPATH_GROUPS[part.slug] : undefined
    const i = intensityMap[part.slug] ?? I_DEFAULT

    // 関連筋がzoneを持つ場合は「主働筋ゾーンの明るさを1段暗くしただけ」として表現する
    const selIntensity = useZone && zoneSpec ? (zoneSpec.isMain ? I_MAIN : I_FLAT) : 0
    const restIntensity = useZone && zoneSpec ? (zoneSpec.isMain ? I_FLAT : I_DEFAULT) : 0

    if (subpathGroups && zoneSpec) {
      const highlightIdx = new Set(subpathGroups[zoneSpec.zone] ?? [])
      for (const sideKey of ['left', 'right'] as const) {
        const sidePaths = part.path[sideKey]
        if (!sidePaths) continue
        const sorted = sortPathsByBBoxY(svgEl, sidePaths)
        sorted.forEach((d, idx) => {
          paintGlowPath(svgEl, defs, d, `${svgEl.id}-g${gid++}`, highlightIdx.has(idx) ? selIntensity : restIntensity)
        })
      }
      for (const d of part.path.common ?? []) {
        paintGlowPath(svgEl, defs, d, `${svgEl.id}-g${gid++}`, restIntensity)
      }
    } else {
      for (const sideKey of ['common', 'left', 'right'] as const) {
        const sidePaths = part.path[sideKey]
        if (!sidePaths) continue
        for (const d of sidePaths) {
          if (useZone && zoneSpec) {
            paintGlowPath(svgEl, defs, d, `${svgEl.id}-g${gid++}`, restIntensity)
            const zoneDef = ZONE_GRADIENT[zoneSpec.zone]
            paintGlowPath(svgEl, defs, d, `${svgEl.id}-g${gid++}`, selIntensity, zoneDef)
          } else {
            paintGlowPath(svgEl, defs, d, `${svgEl.id}-g${gid++}`, i)
          }
        }
      }
    }

    const label = labelMap[part.slug]
    if (label && (useZone || i > 0)) {
      addMuscleLabel(svgEl, part, allPaths, label)
    }
  }

  resolveAboveLabelOverlaps(svgEl)
}

export interface HighlightExercise {
  mainSlug: string | null
  mainZone: MuscleZone | null
  mainMuscleJa: string | null
  related: Array<SlugZone & { ja: string }>
}

export interface SideMaps {
  intensityMap: IntensityMap
  zoneSpecs: ZoneSpec[]
  labelMap: LabelMap
  active: boolean
}

// 主働筋・関連筋の情報から、前面/背面それぞれの発光・ラベル指定を計算する。
// FRONT/BACK間引き（三角筋前部/後部・僧帽筋/上腕三頭筋）もここで反映する
export function computeHighlightMaps(ex: HighlightExercise): { front: SideMaps; back: SideMaps } {
  const intensityMap: IntensityMap = {}
  const labelMap: LabelMap = {}
  if (ex.mainSlug) {
    intensityMap[ex.mainSlug] = I_MAIN
    labelMap[ex.mainSlug] = { ja: ex.mainMuscleJa ?? '', isMain: true }
  }
  for (const r of ex.related) {
    if (!(r.slug in intensityMap)) intensityMap[r.slug] = I_FLAT
    if (!(r.slug in labelMap)) labelMap[r.slug] = { ja: r.ja, isMain: false }
  }

  const zoneSpecs: ZoneSpec[] = []
  if (ex.mainSlug && ex.mainZone) zoneSpecs.push({ slug: ex.mainSlug, zone: ex.mainZone, isMain: true })
  for (const r of ex.related) {
    if (r.zone && (ZONE_GRADIENT[r.zone] || ZONE_SUBPATH_GROUPS[r.slug]?.[r.zone])) {
      zoneSpecs.push({ slug: r.slug, zone: r.zone, isMain: false })
    }
  }

  const frontIntensityMap = { ...intensityMap }
  const frontLabelMap = { ...labelMap }
  if (ex.mainSlug && MAIN_ONLY_BACK_SLUGS.has(ex.mainSlug)) {
    Reflect.deleteProperty(frontIntensityMap, ex.mainSlug)
    Reflect.deleteProperty(frontLabelMap, ex.mainSlug)
  }
  if (ex.mainSlug && ex.mainZone && MAIN_BACK_ONLY_ZONE[ex.mainSlug] === ex.mainZone) {
    Reflect.deleteProperty(frontIntensityMap, ex.mainSlug)
    Reflect.deleteProperty(frontLabelMap, ex.mainSlug)
  }

  const backIntensityMap = { ...intensityMap }
  const backLabelMap = { ...labelMap }
  if (ex.mainSlug && ex.mainZone && MAIN_FRONT_ONLY_ZONE[ex.mainSlug] === ex.mainZone) {
    Reflect.deleteProperty(backIntensityMap, ex.mainSlug)
    Reflect.deleteProperty(backLabelMap, ex.mainSlug)
  }
  for (const r of ex.related) {
    if (r.zone && MAIN_FRONT_ONLY_ZONE[r.slug] === r.zone && ex.mainSlug !== r.slug) {
      Reflect.deleteProperty(backIntensityMap, r.slug)
      Reflect.deleteProperty(backLabelMap, r.slug)
    }
    if (r.zone && MAIN_BACK_ONLY_ZONE[r.slug] === r.zone && ex.mainSlug !== r.slug) {
      Reflect.deleteProperty(frontIntensityMap, r.slug)
      Reflect.deleteProperty(frontLabelMap, r.slug)
    }
  }

  const frontActive = Object.keys(frontIntensityMap).some((s) => FRONT_SLUGS.has(s))
  const backActive = Object.keys(backIntensityMap).some((s) => BACK_SLUGS.has(s))

  return {
    front: { intensityMap: frontIntensityMap, zoneSpecs, labelMap: frontLabelMap, active: frontActive },
    back: { intensityMap: backIntensityMap, zoneSpecs, labelMap: backLabelMap, active: backActive },
  }
}
