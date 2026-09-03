import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { MuscleGroup } from '../generated/prisma/enums.js'

export const exercisesRouter = Router()

// 数値の昇順比較。nullは最後に送る(defaultSortOrderが未設定の種目を後ろに回すため)
function compareNullsLast(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

exercisesRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId

  // 公式種目(created_by IS NULL) + 自分が作成したカスタム種目
  const exercises = await prisma.exercise.findMany({
    where: { OR: [{ createdBy: null }, { createdBy: userId }] },
  })

  // 自分の使用回数を種目ごとに集計。groupByは1回でも使われた種目しか返さないため、
  // 未使用の種目は後述のマージ時に0件扱いにする
  const usageCounts = await prisma.workoutSet.groupBy({
    by: ['exerciseId'],
    where: { workout: { userId, deletedAt: null } },
    _count: { _all: true },
  })
  const usageCountByExerciseId = new Map(
    usageCounts.map((row) => [row.exerciseId, row._count._all]),
  )

  // useCountは複数箇所(ソート・レスポンス)で使うため、先に一度だけ計算して種目データにくっつけておく
  const exercisesWithUseCount = exercises.map((exercise) => ({
    ...exercise,
    useCount: usageCountByExerciseId.get(exercise.id) ?? 0,
  }))

  // 表示順：自分の使用回数DESC → default_sort_order ASC(nullは最後) → 名前順
  // (default_sort_order自体はソート専用の内部値のため、レスポンスには含めない)
  exercisesWithUseCount.sort(
    (a, b) =>
      b.useCount - a.useCount ||
      compareNullsLast(a.defaultSortOrder, b.defaultSortOrder) ||
      a.name.localeCompare(b.name, 'ja'),
  )

  res.status(200).json(
    exercisesWithUseCount.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      muscleDetail: exercise.muscleDetail,
      equipment: exercise.equipment,
      createdBy: exercise.createdBy,
      useCount: exercise.useCount,
    })),
  )
})

const createExerciseSchema = z.object({
  name: z.string().trim().min(1).max(50),
  muscleGroup: z.enum(MuscleGroup),
  muscleDetail: z.string().trim().min(1).max(50).optional(),
  equipment: z.string().trim().min(1).max(50).optional(),
})

exercisesRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createExerciseSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const { name, muscleGroup, muscleDetail, equipment } = parsed.data
  const userId = req.session.userId

  const exercise = await prisma.exercise.create({
    data: {
      name,
      muscleGroup,
      muscleDetail,
      equipment,
      createdBy: userId,
    },
  })

  res.status(201).json({
    id: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    muscleDetail: exercise.muscleDetail,
    equipment: exercise.equipment,
    createdBy: exercise.createdBy,
  })
})
