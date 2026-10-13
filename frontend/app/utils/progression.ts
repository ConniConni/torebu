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

// 前回のトップセット。各セットはこれと比べる（並び順の位置では比べない。ウォームアップの本数が日によって
// 違うと位置がずれ、意図しない↑が出るため。ユーザー判断）。
// 加重セットがあれば最も重いセット（同じ重量なら回数が多い方）、全セット自重なら回数が最も多いセット。
// 回数0（失敗した挑戦）はトップにしない。候補が無ければnull
export function findTopSet(sets: StrengthSetValues[]): StrengthSetValues | null {
  const candidates = sets.filter((s) => s.reps !== null && s.reps > 0)
  const weighted = candidates.filter((s) => s.weightKg !== null)
  const pool = weighted.length > 0 ? weighted : candidates
  let top: StrengthSetValues | null = null
  for (const set of pool) {
    if (
      !top ||
      (set.weightKg ?? 0) > (top.weightKg ?? 0) ||
      ((set.weightKg ?? 0) === (top.weightKg ?? 0) && set.reps! > top.reps!)
    ) {
      top = set
    }
  }
  return top
}

// 今回のセットが前回のトップセットを上回ったか（↑を出すか）。重量が上、または同じ重量で回数が上ならtrue。
// トップが自重（前回が全セット自重）なら、今回も自重のときだけ回数で比べる。自重と加重が混ざっている・
// 今回の回数が0・前回のトップが無い場合はfalse。同じ・下がった場合も印は出さない（ユーザー判断）
export function beatsTopSet(current: StrengthSetValues, top: StrengthSetValues | null): boolean {
  if (!top || top.reps === null || current.reps === null || current.reps === 0) return false
  if (current.weightKg === null || top.weightKg === null) {
    if (current.weightKg !== null || top.weightKg !== null) return false
    return current.reps > top.reps
  }
  if (current.weightKg !== top.weightKg) return current.weightKg > top.weightKg
  return current.reps > top.reps
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
