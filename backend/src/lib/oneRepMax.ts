// 推定1RM（1回だけ挙げられる最大重量の推定値）。Epley式 `重量 × (1 + 回数 / 30)` を使う。
// 回数が多いほど誤差が大きくなるため、計算に使うのは1〜12回のセットだけ（Issue #356）

export const MAX_REPS_FOR_ESTIMATE = 12

// 対象外（回数がnull・0以下・13回以上）ならnull。1回は式を当てると重量より大きくなるため重量そのまま
export function estimateOneRepMaxKg(weightKg: number, reps: number | null): number | null {
  if (reps === null || reps < 1 || reps > MAX_REPS_FOR_ESTIMATE) return null
  if (reps === 1) return weightKg
  return weightKg * (1 + reps / 30)
}

// 0.1kg単位に丸める（日ごとの最大値を出したあとに使う）
export function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}
