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

  // 種目ごとの直近の実績セット(前回記録の自動反映用、Issue #116)。
  // workout.performedAt降順・setOrder降順で全件取ってきて種目ごとに先頭(＝一番新しい)だけ拾う。
  // groupByでは実際の値(weightKg/reps)までは取れないためfindManyしてJS側でreduceする
  const recentSets = await prisma.workoutSet.findMany({
    where: { workout: { userId, deletedAt: null } },
    select: { exerciseId: true, weightKg: true, reps: true },
    orderBy: [{ workout: { performedAt: 'desc' } }, { setOrder: 'desc' }],
  })
  const lastSetByExerciseId = new Map<string, { weightKg: number | null; reps: number }>()
  for (const set of recentSets) {
    if (lastSetByExerciseId.has(set.exerciseId)) continue
    lastSetByExerciseId.set(set.exerciseId, {
      weightKg: set.weightKg === null ? null : Number(set.weightKg),
      reps: set.reps,
    })
  }

  // useCountは複数箇所(ソート・レスポンス)で使うため、先に一度だけ計算して種目データにくっつけておく
  const exercisesWithUseCount = exercises.map((exercise) => ({
    ...exercise,
    useCount: usageCountByExerciseId.get(exercise.id) ?? 0,
  }))

  // 表示順：自分の使用回数DESC → default_sort_order ASC（未設定=カスタム種目はnull扱いで最後） → 名前順
  // 使用実績が無い(useCount=0)ユーザーでも、部位セクション内が定番順(コンパウンド→アイソレーション)に
  // なるようdefault_sort_orderを使う(Issue #167。公式種目はseed.tsで種目マスタの元データ順を投入済み)
  exercisesWithUseCount.sort((a, b) => {
    if (a.useCount !== b.useCount) return b.useCount - a.useCount
    const aOrder = a.defaultSortOrder ?? Number.MAX_SAFE_INTEGER
    const bOrder = b.defaultSortOrder ?? Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.name.localeCompare(b.name, 'ja')
  })

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
      lastSet: lastSetByExerciseId.get(exercise.id) ?? null,
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
    // 作成直後なので実績はまだ無い。GET /exercisesとレスポンスの形を揃えるため含める
    lastSet: null,
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
