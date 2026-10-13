import { sumSetVolumeKg } from './trainingVolume'

// ③記録作成の前回比（Issue #354）。漸進性過負荷（少しずつ負荷を上げる）を見える化する機能群の1つ目。
// 「前回」は対象日より前でその種目のセットがある直近の日付の全セット
// （`GET /exercises/:exerciseId/previous-session`）。筋トレ種目のみが対象で、有酸素は扱わない

export interface StrengthSetValues {
  weightKg: number | null // nullは自重
  reps: number | null
}

export interface PreviousSession {
  performedAt: string // YYYY-MM-DD
  sets: StrengthSetValues[]
}

// 今回のセットと、前回の「並び順で同じ番目」のセットとの比較結果。
// 'up'＝伸びた（↑）、'same'＝同じ（＝）、null＝印なし。下がったことは表示しない方針（ユーザー判断）のため
// 「下がった」は区別せずnullにまとめる
export type SetComparison = 'up' | 'same' | null

export function compareSet(
  current: StrengthSetValues,
  previous: StrengthSetValues | undefined,
): SetComparison {
  if (!previous || current.reps === null || previous.reps === null) return null
  // 回数0は失敗した挑戦の記録のため、比べても意味が無い
  if (current.reps === 0 || previous.reps === 0) return null

  // 両方とも自重なら回数だけで比べる。自重と加重が混ざっている場合は比べようが無いので印なし
  if (current.weightKg === null || previous.weightKg === null) {
    if (current.weightKg !== null || previous.weightKg !== null) return null
    if (current.reps > previous.reps) return 'up'
    return current.reps === previous.reps ? 'same' : null
  }

  if (current.weightKg > previous.weightKg) return 'up'
  if (current.weightKg < previous.weightKg) return null
  if (current.reps > previous.reps) return 'up'
  return current.reps === previous.reps ? 'same' : null
}

function sumReps(sets: StrengthSetValues[]): number {
  return sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
}

// カード単位の「前回超え！」。合計負荷重量（Σ重量×回数、自重セットは除外。GET /stats/volumeと
// 同じ定義でsumSetVolumeKgを共用）が前回を上回ったらtrue。今回・前回とも全セットが自重の種目だけは
// 合計負荷重量が常に0になるため、合計回数で比べる
export function beatsPrevious(
  current: StrengthSetValues[],
  previous: StrengthSetValues[],
): boolean {
  if (current.length === 0 || previous.length === 0) return false
  const allBodyweight = (sets: StrengthSetValues[]) => sets.every((s) => s.weightKg === null)
  if (allBodyweight(current) && allBodyweight(previous)) {
    return sumReps(current) > sumReps(previous)
  }
  return sumSetVolumeKg(current) > sumSetVolumeKg(previous)
}

// 前回の内容を1行にする。例：「前回 10/10：60kg×8・60kg×8・57.5kg×7」。
// 対象日と年が違うときだけ年も付ける（「前回 2025/12/28：…」）。日付はDateを経由せず文字列のまま分解する
// （タイムゾーンで日付がずれないように。docs/spec.md §3-4参照）
export function formatPreviousSession(previous: PreviousSession, targetDate: string): string {
  const [year, month, day] = previous.performedAt.split('-')
  const monthDay = `${Number(month)}/${Number(day)}`
  const date = targetDate.startsWith(`${year}-`) ? monthDay : `${year}/${monthDay}`
  const sets = previous.sets
    .map((s) => `${s.weightKg === null ? '自重' : `${s.weightKg}kg`}×${s.reps ?? 0}`)
    .join('・')
  return `前回 ${date}：${sets}`
}
