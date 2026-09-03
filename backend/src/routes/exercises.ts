import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { MuscleGroup } from '../generated/prisma/enums.js'

export const exercisesRouter = Router()

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

  // 表示順の算出に使うだけなので、default_sort_order自体はレスポンスに含めない(内部実装の詳細)
  const sorted = [...exercises].sort((a, b) => {
    const useCountA = usageCountByExerciseId.get(a.id) ?? 0
    const useCountB = usageCountByExerciseId.get(b.id) ?? 0
    if (useCountA !== useCountB) return useCountB - useCountA

    if (a.defaultSortOrder !== b.defaultSortOrder) {
      if (a.defaultSortOrder === null) return 1
      if (b.defaultSortOrder === null) return -1
      return a.defaultSortOrder - b.defaultSortOrder
    }

    return a.name.localeCompare(b.name, 'ja')
  })

  res.status(200).json(
    sorted.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      muscleDetail: exercise.muscleDetail,
      equipment: exercise.equipment,
      createdBy: exercise.createdBy,
      useCount: usageCountByExerciseId.get(exercise.id) ?? 0,
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
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() })
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
