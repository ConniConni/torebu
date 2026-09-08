import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const ownerEmail = 'stats-owner-test@example.com'
const otherEmail = 'stats-other-test@example.com'
const testPassword = 'password123'

let ownerId: string
let otherId: string
let exerciseId: string
let customExerciseId: string

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const owner = await prisma.user.create({
    data: { email: ownerEmail, passwordHash, displayName: '集計テストユーザー' },
  })
  const other = await prisma.user.create({
    data: { email: otherEmail, passwordHash, displayName: '集計テスト別ユーザー' },
  })
  ownerId = owner.id
  otherId = other.id

  const exercise = await prisma.exercise.create({
    data: { name: 'ベンチプレス', muscleGroup: 'chest' },
  })
  exerciseId = exercise.id
  const customExercise = await prisma.exercise.create({
    data: { name: '自作種目', muscleGroup: 'legs', createdBy: ownerId },
  })
  customExerciseId = customExercise.id
})

afterEach(async () => {
  await prisma.workoutSet.deleteMany({
    where: { workout: { userId: { in: [ownerId, otherId] } } },
  })
  await prisma.workout.deleteMany({ where: { userId: { in: [ownerId, otherId] } } })
  await prisma.exercise.deleteMany({ where: { id: { in: [exerciseId, customExerciseId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } })
})

async function loginAsOwner() {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email: ownerEmail, password: testPassword })
  return agent
}

async function createWorkout(
  userId: string,
  overrides: { performedAt?: Date; deletedAt?: Date } = {},
) {
  return prisma.workout.create({
    data: {
      userId,
      performedAt: overrides.performedAt ?? new Date(),
      deletedAt: overrides.deletedAt,
    },
  })
}

describe('GET /stats/volume', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).get('/stats/volume')

    expect(res.status).toBe(401)
  })

  it('自分の、重量ありのセットのみ日別に合計する', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 60 },
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 2, reps: 8, weightKg: 60 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ date: '2026-09-01', volumeKg: 60 * 10 + 60 * 8 }])
  })

  it('自重セット(weightKgがnull)は集計から除外する', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 15 }, // weightKg省略=自重
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('カスタム種目のセットは集計から除外する', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId: customExerciseId, setOrder: 1, reps: 10, weightKg: 40 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('ソフトデリート済みworkoutのセットは集計から除外する', async () => {
    const workout = await createWorkout(ownerId, {
      performedAt: new Date('2026-09-01'),
      deletedAt: new Date(),
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 40 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('他人のセットは集計に含まれない', async () => {
    const otherWorkout = await createWorkout(otherId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: otherWorkout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 40 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('rangeで指定した期間より前の記録は含まれない', async () => {
    const old = await createWorkout(ownerId, { performedAt: new Date('2000-01-01') })
    await prisma.workoutSet.create({
      data: { workoutId: old.id, exerciseId, setOrder: 1, reps: 10, weightKg: 40 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=1m')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('不正なrangeは400を返す', async () => {
    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=invalid')

    expect(res.status).toBe(400)
  })
})

describe('GET /stats/exercises/:exerciseId/history', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).get(`/stats/exercises/${exerciseId}/history`)

    expect(res.status).toBe(401)
  })

  it('カスタム種目のIDを指定すると404を返す', async () => {
    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${customExerciseId}/history`)

    expect(res.status).toBe(404)
  })

  it('存在しない種目IDを指定すると404を返す', async () => {
    const agent = await loginAsOwner()
    const res = await agent.get('/stats/exercises/00000000-0000-0000-0000-000000000000/history')

    expect(res.status).toBe(404)
  })

  it('日ごとの最大重量・合計挙上重量を返す', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 60 },
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 2, reps: 8, weightKg: 65 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { date: '2026-09-01', maxWeightKg: 65, volumeKg: 60 * 10 + 65 * 8 },
    ])
  })

  it('自重セットは除外する', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 12 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})
