// 推定1RM（1回だけ挙げられる最大重量の推定値、Issue #362）。オコナー式 `重量 × (1 + 0.025 × 回数)` を使う。
// 回数が多いほど誤差が大きくなるため、回数帯で扱いを分ける（記録画面の表示。統計は通常の帯だけ使う）：
//   1〜10回：通常 ／ 11〜14回：参考値 ／ 15回以上：対象外（出さない）
// frontend/app/utils/oneRepMax.ts と同じ式・同じ境界。変えるときは両方そろえる

export const MAX_REPS_NORMAL = 10
export const MAX_REPS_REFERENCE = 14

export type OneRepMaxLevel = 'normal' | 'reference'

export function oneRepMaxLevel(reps: number | null): OneRepMaxLevel | null {
  if (reps === null || reps < 1 || reps > MAX_REPS_REFERENCE) return null
  return reps <= MAX_REPS_NORMAL ? 'normal' : 'reference'
}

// 1回は重量そのまま（式を当てると1回でも重量より大きくなるため）。
// 小数の誤差を避けるため `重量 × (1 + 回数/40)` ではなく `重量 × (40 + 回数) / 40` で計算する。
// 対象外の回数ならnull。丸め（0.1kg）はしない（日ごとの最大値を出したあとにroundToTenthを使う）
export function estimateOneRepMaxKg(weightKg: number, reps: number | null): number | null {
  if (oneRepMaxLevel(reps) === null) return null
  if (reps === 1) return weightKg
  return (weightKg * (40 + reps!)) / 40
}

// 0.1kg単位に丸める（日ごとの最大値を出したあとに使う）
export function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}
