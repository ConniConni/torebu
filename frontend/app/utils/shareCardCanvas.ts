// 画像カードシェア（Issue #314）の画像をブラウザのCanvasで描く。
// サーバーで画像を生成しない（新しい依存関係・サーバー負荷を増やさない）方針のため、ここで完結させる。
// 何を載せるかはshareCard.tsのbuildShareCardDataで決め、ここは配置と見た目だけを担う。
//
// サイズは1080×1350（4:5）。Instagramのフィード・Xのどちらでも大きく切れずに表示される比率。
// 配色はアプリのダークテーマのトークン（assets/css/main.css）に揃え、SNSのタイムラインで目立つようにした

import type { ShareCardData } from './shareCard'

export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_HEIGHT = 1350

const COLORS = {
  surface: '#141414',
  panel: '#1f1f1d',
  ink: '#f2f2ee',
  muted: '#a3a29b',
  border: '#33322c',
  accent: '#c8ff4d',
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
  value: string,
  unit: string,
  x: number,
  y: number,
) {
  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.accent
  ctx.font = `800 88px ${FONT}`
  ctx.fillText(value, x, y)
  const valueWidth = ctx.measureText(value).width
  ctx.fillStyle = COLORS.ink
  ctx.font = `600 34px ${FONT}`
  ctx.fillText(unit, x + valueWidth + 10, y)
}

export function drawShareCard(canvas: HTMLCanvasElement, data: ShareCardData, host: string) {
  canvas.width = SHARE_CARD_WIDTH
  canvas.height = SHARE_CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.textBaseline = 'alphabetic'

  const contentWidth = SHARE_CARD_WIDTH - PADDING * 2
  const right = SHARE_CARD_WIDTH - PADDING

  ctx.fillStyle = COLORS.surface
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT)
  // 上端のアクセントライン
  ctx.fillStyle = COLORS.accent
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, 12)

  // ヘッダー：ロゴと日付
  ctx.fillStyle = COLORS.ink
  ctx.font = `72px ${LOGO_FONT}`
  ctx.textAlign = 'left'
  ctx.fillText('トレ部', PADDING, 160)
  ctx.fillStyle = COLORS.muted
  ctx.font = `600 40px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(data.dateLabel, right, 155)

  // サマリーパネル：合計負荷重量・種目数・セット数
  const panelTop = 210
  const panelHeight = 220
  ctx.fillStyle = COLORS.panel
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
    ctx.fillStyle = COLORS.muted
    ctx.font = `600 30px ${FONT}`
    ctx.fillText(column.label, x, panelTop + 72)
    drawValueWithUnit(ctx, column.value, column.unit, x, panelTop + 172)
  }

  // 通算日数のバッジ
  const badgeTop = 470
  const badgeText = `通算 ${data.dayNumber} 日目のトレーニング`
  ctx.font = `700 36px ${FONT}`
  const badgeWidth = ctx.measureText(badgeText).width + 64
  ctx.fillStyle = COLORS.accent
  roundedRect(ctx, PADDING, badgeTop, badgeWidth, 72, 36)
  ctx.fill()
  ctx.fillStyle = COLORS.surface
  ctx.textAlign = 'left'
  ctx.fillText(badgeText, PADDING + 32, badgeTop + 49)

  // 種目ごとのトップセットとセット数
  const listTop = 570
  const rowHeight = 96
  data.exercises.forEach((exercise, i) => {
    const rowTop = listTop + rowHeight * i
    const baseline = rowTop + 62
    ctx.fillStyle = COLORS.muted
    ctx.font = `600 30px ${FONT}`
    ctx.textAlign = 'right'
    const setLabel = `${exercise.setCount}セット`
    ctx.fillText(setLabel, right, baseline)
    const setLabelWidth = ctx.measureText(setLabel).width

    ctx.fillStyle = COLORS.ink
    ctx.font = `700 40px ${FONT}`
    const topSetRight = right - setLabelWidth - 36
    ctx.fillText(exercise.topSetText, topSetRight, baseline)
    const topSetWidth = ctx.measureText(exercise.topSetText).width

    ctx.textAlign = 'left'
    ctx.font = `600 40px ${FONT}`
    const nameMaxWidth = topSetRight - topSetWidth - 40 - PADDING
    ctx.fillText(fitText(ctx, exercise.name, nameMaxWidth), PADDING, baseline)

    ctx.fillStyle = COLORS.border
    ctx.fillRect(PADDING, rowTop + rowHeight - 2, contentWidth, 2)
  })

  if (data.hiddenExerciseCount > 0) {
    ctx.fillStyle = COLORS.muted
    ctx.font = `600 32px ${FONT}`
    ctx.textAlign = 'left'
    ctx.fillText(
      `ほか${data.hiddenExerciseCount}種目`,
      PADDING,
      listTop + rowHeight * data.exercises.length + 56,
    )
  }

  // フッター：アプリの説明とドメイン（インスタのストーリーは画像内の文字がタップできないため、
  // URLの代わりにドメインを入れて検索してもらえるようにする）
  ctx.fillStyle = COLORS.muted
  ctx.font = `500 28px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillText('仲間と筋トレを記録・応援しあうアプリ', PADDING, SHARE_CARD_HEIGHT - 64)
  ctx.fillStyle = COLORS.ink
  ctx.font = `700 32px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(host, right, SHARE_CARD_HEIGHT - 64)
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
