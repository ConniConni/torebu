// 統計画面の期間比較カード（Issue #366、`GET /stats/growth`）の表示用の整形・並べ替え。
// 漸進性過負荷の見える化の④「伸びの記録の拡張」の1つ目。モックは`docs/mock/growth-record.html`

// 種目別の一覧で、折りたたまずに出す種目数（伸び率の大きい順の上位）
export const GROWTH_VISIBLE_EXERCISES = 5

export interface GrowthExercise {
  exerciseId: string
  name: string
  previousKg: number
  currentKg: number
  growthPct: number | null
}

export type GrowthDirection = 'up' | 'down' | 'flat'

export function growthDirection(pct: number | null): GrowthDirection | null {
  if (pct === null) return null
  if (pct > 0) return 'up'
  if (pct < 0) return 'down'
  return 'flat'
}

// 棒の長さ（0〜100）。一覧の中でいちばん大きい伸び率を100%とした相対値。
// 伸びていない（0以下）・伸び率が出せない種目は棒なし（null）。折りたたんだ種目も含めた全体の最大で決める
export function barPercent(pct: number | null, exercises: GrowthExercise[]): number | null {
  if (pct === null || pct <= 0) return null
  const max = Math.max(0, ...exercises.map((e) => e.growthPct ?? 0))
  if (max <= 0) return null
  return Math.round((pct / max) * 100)
}

// 折りたたんだときに出す種目（先頭から上限まで）と、折りたたまれる種目数。
// 並びはAPIが返した伸び率の大きい順のまま
export function splitVisibleExercises(
  exercises: GrowthExercise[],
  expanded: boolean,
  limit = GROWTH_VISIBLE_EXERCISES,
): { visible: GrowthExercise[]; hiddenCount: number } {
  if (expanded || exercises.length <= limit) return { visible: exercises, hiddenCount: 0 }
  return { visible: exercises.slice(0, limit), hiddenCount: exercises.length - limit }
}

// 伸び率の表示。0は「±0」、マイナスは全角寄りの「−」、出せないときは「—」
export function formatSignedPct(pct: number | null): string {
  if (pct === null) return '—'
  if (pct === 0) return '±0'
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`
}

export function formatSignedDays(diff: number): string {
  if (diff === 0) return '±0日'
  return diff > 0 ? `+${diff}日` : `−${Math.abs(diff)}日`
}

// 推定1RM（kg）は0.1kg単位で小数1桁にそろえる（72.5→80.0）
export function formatOneRmKg(kg: number): string {
  return kg.toFixed(1)
}

// 合計負荷重量は整数・3桁区切り
export function formatVolumeKg(kg: number): string {
  return Math.round(kg).toLocaleString('ja-JP')
}

// YYYY-MM-DD → 「9/16」。期間の表示用
export function formatMonthDay(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function formatPeriod(start: string, end: string): string {
  return `${formatMonthDay(start)}〜${formatMonthDay(end)}`
}
