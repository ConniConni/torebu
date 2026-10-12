import type { MuscleGroup } from '../generated/prisma/enums.js'

// 有酸素種目かどうか(Issue #345)。記録項目(距離・時間 or 重量・回数)の切り替えや、
// ランキング・ルーティン・自己ベストなど筋トレ前提の機能から外す判定は、種目名ではなくこの関数で行う
export function isCardio(exercise: { muscleGroup: MuscleGroup }) {
  return exercise.muscleGroup === 'cardio'
}
