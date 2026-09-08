import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { MuscleGroup } from '../generated/prisma/enums.js'

export const exercisesRouter = Router()

exercisesRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId

  // 公式種目(created_by IS NULL) + 自分が作成したカスタム種目
  // 削除済み(deleted_at有り)のカスタム種目も含めて返す。過去のworkout_sets/routine_exercisesが
  // このレスポンスをキャッシュして種目名を解決しているため、ここで除外すると過去記録の表示が
  // 壊れる(「(不明な種目)」になる)。新規の記録・追加候補からの除外はフロント側でdeletedAtを見て行う
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

  // 表示順：自分の使用回数DESC → 名前順
  // (default_sort_orderは当面すべてnull運用のため、ソート条件には含めない。詳細はdocs/backlog.md参照)
  exercisesWithUseCount.sort(
    (a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name, 'ja'),
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
      // 部位ハイライト用（Phase2、docs/muscle-highlight.md参照）。公式種目のみ値を持ち、
      // カスタム種目は常にnull（フロント側で「データなし」表示に使う）
      mainMuscle: exercise.mainMuscle,
      relatedMuscles: exercise.relatedMuscles,
      mainZone: exercise.mainZone,
      deletedAt: exercise.deletedAt,
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
    // カスタム種目は部位ハイライト非対応のため常にnull/空配列(docs/muscle-highlight.md参照)。
    // GET /exercisesと形を揃えるためレスポンスに含める
    mainMuscle: exercise.mainMuscle,
    relatedMuscles: exercise.relatedMuscles,
    mainZone: exercise.mainZone,
    deletedAt: exercise.deletedAt,
  })
})

// カスタム種目の削除(ソフトデリート)。作成者本人のみ可能。公式種目・他人の種目・
// 存在しないID・削除済みはいずれも404(他人・削除済みのリソースは403ではなく404、docs/spec.md参照)
exercisesRouter.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId

  const exercise = await prisma.exercise.findFirst({
    where: { id: req.params.id, createdBy: userId, deletedAt: null },
  })
  if (!exercise) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  await prisma.exercise.update({
    where: { id: exercise.id },
    data: { deletedAt: new Date() },
  })

  res.status(204).end()
})
