import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { MuscleGroup } from '../generated/prisma/enums.js'
import { isCardio } from '../lib/exercise.js'

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
    select: { exerciseId: true, weightKg: true, reps: true, distanceKm: true, durationSec: true },
    orderBy: [{ workout: { performedAt: 'desc' } }, { setOrder: 'desc' }],
  })
  // 筋トレはweightKg・reps、有酸素はdistanceKm・durationSecに値が入る(使わない側はnull。Issue #345)
  const lastSetByExerciseId = new Map<
    string,
    {
      weightKg: number | null
      reps: number | null
      distanceKm: number | null
      durationSec: number | null
    }
  >()
  for (const set of recentSets) {
    if (lastSetByExerciseId.has(set.exerciseId)) continue
    lastSetByExerciseId.set(set.exerciseId, {
      weightKg: set.weightKg === null ? null : Number(set.weightKg),
      reps: set.reps,
      distanceKm: set.distanceKm === null ? null : Number(set.distanceKm),
      durationSec: set.durationSec,
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
      // 有酸素種目の速さの表示単位(pace=分/km、kmh=km/h)。筋トレ・カスタム種目はnull
      speedUnit: exercise.speedUnit,
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
  // 有酸素(cardio)は公式種目のみ。カスタム種目としては作成できない(Issue #345)
  muscleGroup: z.enum(MuscleGroup).refine((value) => value !== 'cardio', {
    message: '有酸素の種目は作成できません',
  }),
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
    speedUnit: exercise.speedUnit,
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

const previousSessionQuerySchema = z.object({
  // 対象日(③で開いている日)。実在しない暦日(2026-02-30等)はDateにすると翌月へ繰り上がるため、
  // 文字列に戻して一致するかで弾く
  before: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(value)
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    }),
})

// GET /exercises/:exerciseId/previous-session?before=YYYY-MM-DD
// ③記録作成の前回比(Issue #354)用。対象日より前の日付のうち、その種目のセットがある直近の日付の
// 全セットを返す。「前回」はworkout単位ではなく日付単位で決めるため、対象日のworkoutがまだ無い
// (③を開いただけ)状態でも引ける。workoutsには日付の一意制約が無いため、同じ日に複数のworkoutが
// あれば作成順(createdAt)→setOrder順に連結する。削除済みのworkoutは見ない。
// GET /exercisesのlastSet(1セット分のみ・useStateでキャッシュ)では過去日を開いたときに
// 「その日から見た前回」にならないため、別のAPIにした
exercisesRouter.get('/:exerciseId/previous-session', requireAuth, async (req, res) => {
  const parsed = previousSessionQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId
  const exerciseId = req.params.exerciseId as string

  // 見える種目はGET /exercisesと同じ「公式 or 自分のカスタム」。削除済みのカスタム種目も過去記録の
  // 比較には使えるため含める(workouts.ts/routines.tsのfindVisibleExerciseは新規追加用で、削除済みの
  // 扱いが異なるため使わない)。有酸素かどうかの判定より先に見えるかを確かめ、他人の種目の存在を隠す
  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, OR: [{ createdBy: null }, { createdBy: userId }] },
  })
  if (!exercise) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  // 前回比は重量・回数の比較のため、有酸素は対象外(POST /routines/:id/exercisesと同じ扱い)
  if (isCardio(exercise)) {
    res.status(400).json({ error: 'invalid_exercise' })
    return
  }

  // performedAtは@db.Date(時刻なし)のため、UTCの0時として比較すれば日付の比較になる
  const workoutFilter = { userId, deletedAt: null }
  const latest = await prisma.workoutSet.findFirst({
    where: {
      exerciseId,
      workout: { ...workoutFilter, performedAt: { lt: new Date(parsed.data.before) } },
    },
    select: { workout: { select: { performedAt: true } } },
    orderBy: { workout: { performedAt: 'desc' } },
  })
  if (!latest) {
    res.status(200).json(null)
    return
  }

  const sets = await prisma.workoutSet.findMany({
    where: {
      exerciseId,
      workout: { ...workoutFilter, performedAt: latest.workout.performedAt },
    },
    select: { weightKg: true, reps: true },
    // createdAtが同時刻のworkoutでセットが入り混じらないよう、workoutIdでも区切る
    orderBy: [{ workout: { createdAt: 'asc' } }, { workoutId: 'asc' }, { setOrder: 'asc' }],
  })

  res.status(200).json({
    performedAt: latest.workout.performedAt.toISOString().slice(0, 10),
    sets: sets.map((set) => ({
      weightKg: set.weightKg === null ? null : Number(set.weightKg),
      reps: set.reps,
    })),
  })
})

// カスタム種目の削除(ソフトデリート)。作成者本人のみ可能。公式種目・他人の種目・
// 存在しないID・削除済みはいずれも404(他人・削除済みのリソースは403ではなく404、docs/spec.md参照)
exercisesRouter.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId

  const exercise = await prisma.exercise.findFirst({
    where: { id: req.params.id as string, createdBy: userId, deletedAt: null },
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
