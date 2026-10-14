// ③記録作成画面のセット行に出す推定1RM（「RM」列、Issue #360）。
// 計算式は統計の推定1RM（backend/src/lib/oneRepMax.ts、Issue #356）と同じ：Epley式
// `重量 × (1 + 回数 / 30)`、1回は重量そのまま、1〜12回のセットだけ対象。
// 統計と値がずれないよう、式や上限を変えるときは両方そろえる

const MAX_REPS_FOR_ESTIMATE = 12

// 対象外（自重・回数が未入力か0・13回以上）ならnull。0.1kg単位に丸める
export function estimateOneRepMaxKg(weightKg: number | null, reps: number | null): number | null {
  if (weightKg === null || reps === null || reps < 1 || reps > MAX_REPS_FOR_ESTIMATE) return null
  const value = reps === 1 ? weightKg : weightKg * (1 + reps / 30)
  return Math.round(value * 10) / 10
}

// カード内で強調する値（最大）。値のある行が2つ未満なら、強調しても比べる相手がいないためnull
export function topEstimate(estimates: (number | null)[]): number | null {
  const values = estimates.filter((v): v is number => v !== null)
  return values.length >= 2 ? Math.max(...values) : null
}
