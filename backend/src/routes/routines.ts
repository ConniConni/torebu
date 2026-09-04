import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { RoutineModel, RoutineExerciseModel, ExerciseModel } from '../generated/prisma/models.js'

export const routinesRouter = Router()

function serializeRoutine(routine: RoutineModel) {
  return {
    id: routine.id,
    name: routine.name,
    createdAt: routine.createdAt,
    updatedAt: routine.updatedAt,
  }
}

function serializeRoutineExercise(routineExercise: RoutineExerciseModel) {
  return {
    id: routineExercise.id,
    routineId: routineExercise.routineId,
    exerciseId: routineExercise.exerciseId,
    sortOrder: routineExercise.sortOrder,
  }
}

// ルーティン詳細では、種目マスタを未取得のまま開かれても種目名・部位が表示できるよう埋め込んで返す
// (IDのみ返すとGET /exercisesとの突き合わせが必要になる)
function serializeRoutineExerciseWithExercise(
  routineExercise: RoutineExerciseModel,
  exercise: ExerciseModel,
) {
  return {
    ...serializeRoutineExercise(routineExercise),
    exercise: {
      id: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
    },
  }
}

// 自分のroutineのみ返す。他人のroutineは404扱いにしてIDOR対策とする
// (routinesにはworkoutsのようなdeleted_atが無い。物理削除でよい理由はdocs/schema.mdの「設計方針メモ」参照)
async function findOwnRoutine(userId: string, routineId: string) {
  return prisma.routine.findFirst({ where: { id: routineId, userId } })
}

// GET /exercisesと同じ基準(公式 or 自分のカスタム)で、ルーティンに使ってよい種目かを確認する
async function isExerciseVisible(userId: string, exerciseId: string) {
  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, OR: [{ createdBy: null }, { createdBy: userId }] },
  })
  return exercise !== null
}

const createRoutineSchema = z.object({
  name: z.string().trim().min(1).max(50),
})

routinesRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createRoutineSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  const routine = await prisma.routine.create({
    data: { userId, name: parsed.data.name },
  })

  res.status(201).json(serializeRoutine(routine))
})

routinesRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  const routines = await prisma.routine.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  res.status(200).json(routines.map(serializeRoutine))
})

routinesRouter.get('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const routine = await findOwnRoutine(userId, req.params.id as string)
  if (!routine) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const exercises = await prisma.routineExercise.findMany({
    where: { routineId: routine.id },
    orderBy: { sortOrder: 'asc' },
    include: { exercise: true },
  })

  res.status(200).json({
    ...serializeRoutine(routine),
    exercises: exercises.map((e) => serializeRoutineExerciseWithExercise(e, e.exercise)),
  })
})

const updateRoutineSchema = z.object({
  name: z.string().trim().min(1).max(50),
})

routinesRouter.patch('/:id', requireAuth, async (req, res) => {
  const parsed = updateRoutineSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const routine = await findOwnRoutine(userId, req.params.id as string)
  if (!routine) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const updated = await prisma.routine.update({
    where: { id: routine.id },
    data: { name: parsed.data.name },
  })

  res.status(200).json(serializeRoutine(updated))
})

routinesRouter.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const routine = await findOwnRoutine(userId, req.params.id as string)
  if (!routine) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  // 物理削除。routine_exercisesはFKのonDelete: Cascadeでまとめて消える
  // (ソフトデリートにしない理由はdocs/schema.mdの「設計方針メモ」参照)
  await prisma.routine.delete({ where: { id: routine.id } })

  res.status(204).send()
})

const addExerciseSchema = z.object({
  exerciseId: z.string().uuid(),
  sortOrder: z.number().int().positive(),
})

routinesRouter.post('/:id/exercises', requireAuth, async (req, res) => {
  const parsed = addExerciseSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const routine = await findOwnRoutine(userId, req.params.id as string)
  if (!routine) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const visible = await isExerciseVisible(userId, parsed.data.exerciseId)
  if (!visible) {
    res.status(400).json({ error: 'invalid_exercise' })
    return
  }

  const routineExercise = await prisma.routineExercise.create({
    data: {
      routineId: routine.id,
      exerciseId: parsed.data.exerciseId,
      sortOrder: parsed.data.sortOrder,
    },
  })

  res.status(201).json(serializeRoutineExercise(routineExercise))
})

const updateRoutineExerciseSchema = z.object({
  sortOrder: z.number().int().positive(),
})

async function findOwnRoutineExercise(userId: string, routineId: string, routineExerciseId: string) {
  const routine = await findOwnRoutine(userId, routineId)
  if (!routine) return null
  return prisma.routineExercise.findFirst({ where: { id: routineExerciseId, routineId: routine.id } })
}

routinesRouter.patch('/:id/exercises/:routineExerciseId', requireAuth, async (req, res) => {
  const parsed = updateRoutineExerciseSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const routineExercise = await findOwnRoutineExercise(
    userId,
    req.params.id as string,
    req.params.routineExerciseId as string,
  )
  if (!routineExercise) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const updated = await prisma.routineExercise.update({
    where: { id: routineExercise.id },
    data: { sortOrder: parsed.data.sortOrder },
  })

  res.status(200).json(serializeRoutineExercise(updated))
})

routinesRouter.delete('/:id/exercises/:routineExerciseId', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const routineExercise = await findOwnRoutineExercise(
    userId,
    req.params.id as string,
    req.params.routineExerciseId as string,
  )
  if (!routineExercise) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  await prisma.routineExercise.delete({ where: { id: routineExercise.id } })

  res.status(204).send()
})
