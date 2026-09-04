import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { WorkoutModel, WorkoutSetModel } from '../generated/prisma/models.js'

export const workoutsRouter = Router()

function serializeWorkout(workout: WorkoutModel) {
  return {
    id: workout.id,
    performedAt: workout.performedAt.toISOString().slice(0, 10),
    memo: workout.memo,
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
  }
}

function serializeSet(set: WorkoutSetModel) {
  return {
    id: set.id,
    workoutId: set.workoutId,
    exerciseId: set.exerciseId,
    setOrder: set.setOrder,
    weightKg: set.weightKg === null ? null : Number(set.weightKg),
    reps: set.reps,
  }
}

// 自分の(ソフトデリートされていない)workoutのみ返す。他人・削除済みは404扱いにしてIDOR対策とする
async function findOwnWorkout(userId: string, workoutId: string) {
  return prisma.workout.findFirst({ where: { id: workoutId, userId, deletedAt: null } })
}

// GET /exercisesと同じ基準(公式 or 自分のカスタム)で、記録に使ってよい種目かを確認する
async function isExerciseVisible(userId: string, exerciseId: string) {
  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, OR: [{ createdBy: null }, { createdBy: userId }] },
  })
  return exercise !== null
}

const createWorkoutSchema = z.object({
  performedAt: z.coerce.date(),
  memo: z.string().trim().min(1).max(500).optional(),
})

workoutsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createWorkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  const workout = await prisma.workout.create({
    data: { userId, performedAt: parsed.data.performedAt, memo: parsed.data.memo },
  })

  res.status(201).json(serializeWorkout(workout))
})

workoutsRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  const workouts = await prisma.workout.findMany({
    where: { userId, deletedAt: null },
    orderBy: { performedAt: 'desc' },
  })

  res.status(200).json(workouts.map(serializeWorkout))
})

workoutsRouter.get('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findOwnWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const sets = await prisma.workoutSet.findMany({
    where: { workoutId: workout.id },
    orderBy: { setOrder: 'asc' },
  })

  res.status(200).json({ ...serializeWorkout(workout), sets: sets.map(serializeSet) })
})

// performedAtは編集不可(意図的)：③「今日の記録を始める」が「同じ日付のworkoutがあれば再開する」
// という日付ベースの引き当てをしているため、記録日を後から動かせると
// 「移動先の元の日付でworkoutを再開しようとした際に、行き場を失った古い日付の分と合わせて
// 実質的に記録が二重に増える」事故につながる(docs/backlog.md参照)。記録日を固定にすることで
// この事故を構造的に防ぐ
const updateWorkoutSchema = z.object({
  // 空文字列・nullはメモのクリア(null化)として扱う。省略時のみ「変更しない」
  memo: z.string().trim().max(500).nullable(),
})

workoutsRouter.patch('/:id', requireAuth, async (req, res) => {
  const parsed = updateWorkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findOwnWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const updated = await prisma.workout.update({
    where: { id: workout.id },
    // 空文字列はnull(メモ無し)に正規化して保存する
    data: { memo: parsed.data.memo || null },
  })

  res.status(200).json(serializeWorkout(updated))
})

workoutsRouter.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findOwnWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  // ソフトデリート。reactions/comments(Phase2)を残す設計のため物理削除しない
  await prisma.workout.update({ where: { id: workout.id }, data: { deletedAt: new Date() } })

  res.status(204).send()
})

// 重量入力は0.5kg刻み(プレート・ダンベルの一般的な最小刻み幅)、上限は現実的な範囲で緩めに999.5kg
const weightKgSchema = z
  .number()
  .positive()
  .max(999.5, { message: '重量は999.5kg以下で入力してください' })
  .refine((value) => Math.round(value * 2) === value * 2, {
    message: '重量は0.5kg刻みで入力してください',
  })
const repsSchema = z.number().int().positive().max(999)

const createSetSchema = z.object({
  exerciseId: z.string().uuid(),
  weightKg: weightKgSchema.optional(),
  reps: repsSchema,
})

// 同じworkout内で同じ種目のsetが並ぶ順番。クライアント指定だと同時追加時にずれる懸念があるため、
// サーバー側で「その種目の既存setの最大setOrder + 1」を採番する(削除で欠番が出ても採番はズレない)
async function nextSetOrder(workoutId: string, exerciseId: string) {
  const aggregate = await prisma.workoutSet.aggregate({
    where: { workoutId, exerciseId },
    _max: { setOrder: true },
  })
  return (aggregate._max.setOrder ?? 0) + 1
}

workoutsRouter.post('/:id/sets', requireAuth, async (req, res) => {
  const parsed = createSetSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const workout = await findOwnWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const visible = await isExerciseVisible(userId, parsed.data.exerciseId)
  if (!visible) {
    res.status(400).json({ error: 'invalid_exercise' })
    return
  }

  const setOrder = await nextSetOrder(workout.id, parsed.data.exerciseId)
  const set = await prisma.workoutSet.create({
    data: {
      workoutId: workout.id,
      exerciseId: parsed.data.exerciseId,
      setOrder,
      weightKg: parsed.data.weightKg,
      reps: parsed.data.reps,
    },
  })

  res.status(201).json(serializeSet(set))
})

const updateSetSchema = z
  .object({
    weightKg: weightKgSchema.nullable().optional(),
    reps: repsSchema.optional(),
  })
  // 空のPATCH({})は意味の無い更新なので、PATCH /workouts/:idと同様に最低1項目を要求する
  .refine((data) => data.weightKg !== undefined || data.reps !== undefined, {
    message: 'weightKg・repsのいずれかを指定してください',
  })

async function findOwnSet(userId: string, workoutId: string, setId: string) {
  const workout = await findOwnWorkout(userId, workoutId)
  if (!workout) return null
  return prisma.workoutSet.findFirst({ where: { id: setId, workoutId: workout.id } })
}

workoutsRouter.patch('/:id/sets/:setId', requireAuth, async (req, res) => {
  const parsed = updateSetSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const set = await findOwnSet(userId, req.params.id as string, req.params.setId as string)
  if (!set) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const updated = await prisma.workoutSet.update({
    where: { id: set.id },
    data: parsed.data,
  })

  res.status(200).json(serializeSet(updated))
})

workoutsRouter.delete('/:id/sets/:setId', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const set = await findOwnSet(userId, req.params.id as string, req.params.setId as string)
  if (!set) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  await prisma.workoutSet.delete({ where: { id: set.id } })

  res.status(204).send()
})
