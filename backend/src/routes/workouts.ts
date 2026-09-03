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

const updateWorkoutSchema = z.object({
  memo: z.string().trim().min(1).max(500),
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
    data: { memo: parsed.data.memo },
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

const createSetSchema = z.object({
  exerciseId: z.string().uuid(),
  setOrder: z.number().int().positive(),
  weightKg: z.number().positive().optional(),
  reps: z.number().int().positive(),
})

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

  const set = await prisma.workoutSet.create({
    data: {
      workoutId: workout.id,
      exerciseId: parsed.data.exerciseId,
      setOrder: parsed.data.setOrder,
      weightKg: parsed.data.weightKg,
      reps: parsed.data.reps,
    },
  })

  res.status(201).json(serializeSet(set))
})

const updateSetSchema = z.object({
  setOrder: z.number().int().positive().optional(),
  weightKg: z.number().positive().nullable().optional(),
  reps: z.number().int().positive().optional(),
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
