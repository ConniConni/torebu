// 画像カードシェア（Issue #314）の画像をブラウザのCanvasで描く。
// サーバーで画像を生成しない（新しい依存関係・サーバー負荷を増やさない）方針のため、ここで完結させる。
// 何を載せるかはshareCard.tsのbuildShareCardDataで決め、ここは配置と見た目だけを担う。
//
// サイズは1080×1350（4:5）。Instagramのフィード・Xのどちらでも大きく切れずに表示される比率。
// 配色はシェアした本人のアプリのテーマ（useTheme）に合わせ、ライト／ダークのトークン（assets/css/main.css・
// 各画面のTailwindクラス）に揃える（2026-10-03、ユーザー判断。当初はダーク固定だった）

import type { ShareCardData } from './shareCard'
import type { Theme } from './theme'

export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_HEIGHT = 1350

interface ShareCardPalette {
  surface: string // 背景
  panel: string // サマリーパネル
  ink: string // 本文
  muted: string // ラベル・補足
  border: string // 種目の区切り線
  value: string // 大きな数字
  highlight: string // 上端のライン・通算日数バッジの背景
  onHighlight: string // バッジの文字
}

// ライトは②ホーム等の配色（bg-gray-50・白パネル・brand-700の数字・brand-600のボタン）、
// ダークはdark:系のトークン（surface/panel/ink/muted/border-dark/accent）と同じ値
export const SHARE_CARD_PALETTES: Record<Theme, ShareCardPalette> = {
  light: {
    surface: '#f9fafb',
    panel: '#ffffff',
    ink: '#111827',
    muted: '#6b7280',
    border: '#e5e7eb',
    value: '#b8431a',
    highlight: '#d8531f',
    onHighlight: '#ffffff',
  },
  dark: {
    surface: '#141414',
    panel: '#1f1f1d',
    ink: '#f2f2ee',
    muted: '#a3a29b',
    border: '#33322c',
    value: '#c8ff4d',
    highlight: '#c8ff4d',
    onHighlight: '#141414',
  },
}

const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Meiryo", sans-serif'
// トップ画面の見出しと同じロゴ用フォント（nuxt.config.tsでGoogle Fontsから読み込み済み）
const LOGO_FONT = '"Yusei Magic", sans-serif'

const PADDING = 80

// ロゴ用フォントはCSSで使われるまでダウンロードされないため、描画前に明示的に読み込む。
// 回線が遅いと初回のダウンロードに数秒かかり、その間プレビューが出ないままになるため、
// 一定時間で打ち切って代替フォントで描く（失敗した場合も同じ）
const FONT_LOAD_TIMEOUT_MS = 2000

export async function loadShareCardFonts() {
  try {
    await Promise.race([
      document.fonts.load(`72px ${LOGO_FONT}`, 'トレ部'),
      new Promise((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
    ])
  } catch {
    // 代替フォントで描く
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 長い種目名（カスタム種目）は、幅に収まらない分を「…」で切る
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let truncated = text
  while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return `${truncated}…`
}

// 数値と単位を、数値を大きく・単位を小さくして同じベースラインに並べる
function drawValueWithUnit(
  ctx: CanvasRenderingContext2D,
  colors: ShareCardPalette,
  value: string,
  unit: string,
  x: number,
  y: number,
) {
  ctx.textAlign = 'left'
  ctx.fillStyle = colors.value
  ctx.font = `800 88px ${FONT}`
  ctx.fillText(value, x, y)
  const valueWidth = ctx.measureText(value).width
  ctx.fillStyle = colors.ink
  ctx.font = `600 34px ${FONT}`
  ctx.fillText(unit, x + valueWidth + 10, y)
}

export function drawShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  host: string,
  theme: Theme,
) {
  const colors = SHARE_CARD_PALETTES[theme]
  canvas.width = SHARE_CARD_WIDTH
  canvas.height = SHARE_CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.textBaseline = 'alphabetic'

  const contentWidth = SHARE_CARD_WIDTH - PADDING * 2
  const right = SHARE_CARD_WIDTH - PADDING

  ctx.fillStyle = colors.surface
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT)
  // 上端のアクセントライン
  ctx.fillStyle = colors.highlight
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, 12)

  // ヘッダー：ロゴと日付
  ctx.fillStyle = colors.ink
  ctx.font = `72px ${LOGO_FONT}`
  ctx.textAlign = 'left'
  ctx.fillText('トレ部', PADDING, 150)
  ctx.fillStyle = colors.muted
  ctx.font = `600 40px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(data.dateLabel, right, 145)

  // サマリーパネル：合計負荷重量・種目数・セット数
  const panelTop = 195
  const panelHeight = 200
  ctx.fillStyle = colors.panel
  roundedRect(ctx, PADDING, panelTop, contentWidth, panelHeight, 28)
  ctx.fill()

  const columns = [
    {
      label: '合計負荷重量',
      value: Math.round(data.totalVolumeKg).toLocaleString('ja-JP'),
      unit: 'kg',
      x: 0,
    },
    { label: '種目', value: String(data.exerciseCount), unit: '', x: 0.55 },
    { label: 'セット', value: String(data.setCount), unit: '', x: 0.78 },
  ]
  for (const column of columns) {
    const x = PADDING + 44 + (contentWidth - 44) * column.x
    ctx.textAlign = 'left'
    ctx.fillStyle = colors.muted
    ctx.font = `600 30px ${FONT}`
    ctx.fillText(column.label, x, panelTop + 66)
    drawValueWithUnit(ctx, colors, column.value, column.unit, x, panelTop + 160)
  }

  // 通算日数のバッジ
  const badgeTop = 425
  const badgeText = `通算 ${data.dayNumber} 日目のトレーニング`
  ctx.font = `700 36px ${FONT}`
  const badgeWidth = ctx.measureText(badgeText).width + 64
  ctx.fillStyle = colors.highlight
  roundedRect(ctx, PADDING, badgeTop, badgeWidth, 72, 36)
  ctx.fill()
  ctx.fillStyle = colors.onHighlight
  ctx.textAlign = 'left'
  ctx.fillText(badgeText, PADDING + 32, badgeTop + 49)

  // 種目ごと：1行目に種目名とセット数、2行目に全セットの内訳（formatSetsText）。
  // 内訳が長くて幅に収まらない場合は「…」で切る
  const listTop = 525
  const rowHeight = 120
  data.exercises.forEach((exercise, i) => {
    const rowTop = listTop + rowHeight * i
    const nameBaseline = rowTop + 50
    ctx.fillStyle = colors.muted
    ctx.font = `600 30px ${FONT}`
    ctx.textAlign = 'right'
    const setLabel = `${exercise.setCount}セット`
    ctx.fillText(setLabel, right, nameBaseline)
    const setLabelWidth = ctx.measureText(setLabel).width

    ctx.fillStyle = colors.ink
    ctx.textAlign = 'left'
    ctx.font = `600 40px ${FONT}`
    const nameMaxWidth = contentWidth - setLabelWidth - 32
    ctx.fillText(fitText(ctx, exercise.name, nameMaxWidth), PADDING, nameBaseline)

    ctx.fillStyle = colors.value
    ctx.font = `700 34px ${FONT}`
    ctx.fillText(fitText(ctx, exercise.setsText, contentWidth), PADDING, rowTop + 98)

    ctx.fillStyle = colors.border
    ctx.fillRect(PADDING, rowTop + rowHeight - 2, contentWidth, 2)
  })

  if (data.hiddenExerciseCount > 0) {
    ctx.fillStyle = colors.muted
    ctx.font = `600 32px ${FONT}`
    ctx.textAlign = 'left'
    ctx.fillText(
      `ほか${data.hiddenExerciseCount}種目`,
      PADDING,
      listTop + rowHeight * data.exercises.length + 48,
    )
  }

  // フッター：アプリの説明とドメイン（インスタのストーリーは画像内の文字がタップできないため、
  // URLの代わりにドメインを入れて検索してもらえるようにする）
  // 本番のドメイン（torebu-7gf1.vercel.app）は長く、説明文と横に並べると端末のフォントによっては
  // 重なるため、2行に分けて左揃えにする
  ctx.fillStyle = colors.muted
  ctx.font = `500 28px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillText('仲間と筋トレを記録・応援しあうアプリ', PADDING, SHARE_CARD_HEIGHT - 112)
  ctx.fillStyle = colors.ink
  ctx.font = `700 34px ${FONT}`
  ctx.fillText(fitText(ctx, host, contentWidth), PADDING, SHARE_CARD_HEIGHT - 60)
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
