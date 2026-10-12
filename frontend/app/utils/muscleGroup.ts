// backend/src/generated/prisma/enums.ts の MuscleGroup と対応する値。
// フロント側でPrisma生成物を直接importしないため、値をここに複製して持つ
//
// MUSCLE_GROUPSは④種目選択の筋トレ7部位のセクションに使う固定リスト。有酸素('cardio'、Issue #345)は
// 型(MuscleGroup)には含めるが、このリストには含めない。④では筋トレの7部位の後ろに別扱いで
// 追加している(器具の絞り込みの対象外で、ルーティン編集からは出さないため。exercises.vue参照)
export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'glutes',
  'abs',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number] | 'cardio'

const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: '胸',
  back: '背中',
  legs: '脚',
  shoulders: '肩',
  arms: '腕',
  glutes: 'お尻',
  abs: '腹筋',
  cardio: '有酸素',
}

export function muscleGroupLabel(muscleGroup: MuscleGroup): string {
  return MUSCLE_GROUP_LABELS[muscleGroup]
}
