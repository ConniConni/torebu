// backend/src/generated/prisma/enums.ts の MuscleGroup と対応する値。
// フロント側でPrisma生成物を直接importしないため、値をここに複製して持つ
export const MUSCLE_GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'glutes', 'abs'] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: '胸',
  back: '背中',
  legs: '脚',
  shoulders: '肩',
  arms: '腕',
  glutes: 'お尻',
  abs: '腹筋',
}

export function muscleGroupLabel(muscleGroup: MuscleGroup): string {
  return MUSCLE_GROUP_LABELS[muscleGroup]
}
