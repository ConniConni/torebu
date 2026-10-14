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
let runId: string
let bikeId: string

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
  const run = await prisma.exercise.create({
    data: { name: '集計テスト用ラン', muscleGroup: 'cardio', speedUnit: 'pace' },
  })
  const bike = await prisma.exercise.create({
    data: { name: '集計テスト用バイク', muscleGroup: 'cardio', speedUnit: 'kmh' },
  })
  runId = run.id
  bikeId = bike.id
})

afterEach(async () => {
  await prisma.workoutSet.deleteMany({
    where: { workout: { userId: { in: [ownerId, otherId] } } },
  })
  await prisma.workout.deleteMany({ where: { userId: { in: [ownerId, otherId] } } })
  await prisma.exercise.deleteMany({
    where: { id: { in: [exerciseId, customExerciseId, runId, bikeId] } },
  })
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
      data: {
        workoutId: workout.id,
        exerciseId: customExerciseId,
        setOrder: 1,
        reps: 10,
        weightKg: 40,
      },
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

  it('日ごとの最大重量・合計負荷重量を返す', async () => {
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
      {
        date: '2026-09-01',
        maxWeightKg: 65,
        volumeKg: 60 * 10 + 65 * 8,
        estimated1RmKg: 82.3,
      },
    ])
  })

  it('推定1RMは同じ日の対象セットの最大値(0.1kg単位)になる', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 60 }, // 80.0
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 2, reps: 6, weightKg: 65 }, // 78.0
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 3, reps: 15, weightKg: 40 }, // 対象外
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].estimated1RmKg).toBe(80)
  })

  it('13回以上のセットだけの日は推定1RMがnullになる(日自体は残る)', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 15, weightKg: 40 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { date: '2026-09-01', maxWeightKg: 40, volumeKg: 600, estimated1RmKg: null },
    ])
  })

  it('他人の記録は推定1RMに混ざらない', async () => {
    const otherWorkout = await createWorkout(otherId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: otherWorkout.id, exerciseId, setOrder: 1, reps: 1, weightKg: 200 },
    })
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 1, weightKg: 100 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].estimated1RmKg).toBe(100)
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

describe('GET /stats/exercises/:exerciseId/history（有酸素、Issue #352）', () => {
  it('日ごとの距離合計と、距離・時間がそろったセットの加重平均ペース・時速を返す', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    // 5km/30:00 と 5km/25:00 → 合計10km・55分 → 330秒/km、約10.9km/h
    await prisma.workoutSet.create({
      data: {
        workoutId: workout.id,
        exerciseId: runId,
        setOrder: 1,
        distanceKm: 5,
        durationSec: 1800,
      },
    })
    await prisma.workoutSet.create({
      data: {
        workoutId: workout.id,
        exerciseId: runId,
        setOrder: 2,
        distanceKm: 5,
        durationSec: 1500,
      },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${runId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { date: '2026-09-01', distanceKm: 10, paceSecPerKm: 330, speedKmh: 10.9 },
    ])
  })

  it('距離だけの日は距離を返し、速さはnull。時間だけの日は含めない', async () => {
    const w1 = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: w1.id, exerciseId: bikeId, setOrder: 1, distanceKm: 20.5 },
    })
    const w2 = await createWorkout(ownerId, { performedAt: new Date('2026-09-02') })
    await prisma.workoutSet.create({
      data: { workoutId: w2.id, exerciseId: bikeId, setOrder: 1, durationSec: 1800 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${bikeId}/history?range=all`)

    expect(res.body).toEqual([
      { date: '2026-09-01', distanceKm: 20.5, paceSecPerKm: null, speedKmh: null },
    ])
  })

  it('他人の記録・削除済みの記録は含めない', async () => {
    const mine = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    const deleted = await createWorkout(ownerId, {
      performedAt: new Date('2026-09-02'),
      deletedAt: new Date(),
    })
    const others = await createWorkout(otherId, { performedAt: new Date('2026-09-03') })
    for (const w of [mine, deleted, others]) {
      await prisma.workoutSet.create({
        data: { workoutId: w.id, exerciseId: runId, setOrder: 1, distanceKm: 5, durationSec: 1800 },
      })
    }

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${runId}/history?range=all`)

    expect(res.body.map((p: { date: string }) => p.date)).toEqual(['2026-09-01'])
  })
})
