import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const ownerEmail = 'exercises-owner-test@example.com'
const otherEmail = 'exercises-other-test@example.com'
const testPassword = 'password123'

let ownerId: string
let otherId: string
// 公式種目(createdBy: null)はuserIdで追わずに片付けられないため、作成したIDを都度記録しておく
let createdExerciseIds: string[]

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const owner = await prisma.user.create({
    data: { email: ownerEmail, passwordHash, displayName: '種目テストユーザー' },
  })
  const other = await prisma.user.create({
    data: { email: otherEmail, passwordHash, displayName: '種目テスト別ユーザー' },
  })
  ownerId = owner.id
  otherId = other.id
  createdExerciseIds = []
})

afterEach(async () => {
  await prisma.$executeRaw`DELETE FROM session`
  await prisma.workoutSet.deleteMany({
    where: { workout: { userId: { in: [ownerId, otherId] } } },
  })
  await prisma.workout.deleteMany({ where: { userId: { in: [ownerId, otherId] } } })
  // createExerciseヘルパー経由(公式種目含む)と、POST /exercises経由(createdByが自分)の両方を片付ける
  await prisma.exercise.deleteMany({
    where: {
      OR: [{ id: { in: createdExerciseIds } }, { createdBy: { in: [ownerId, otherId] } }],
    },
  })
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } })
})

async function createExercise(args: Parameters<typeof prisma.exercise.create>[0]) {
  const exercise = await prisma.exercise.create(args)
  createdExerciseIds.push(exercise.id)
  return exercise
}

async function loginAsOwner() {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email: ownerEmail, password: testPassword })
  return agent
}

describe('GET /exercises', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).get('/exercises')

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'unauthenticated' })
  })

  it('公式種目と自分のカスタム種目のみ返り、他人のカスタム種目は含まれない', async () => {
    const official = await createExercise({
      data: { name: 'ベンチプレス', muscleGroup: 'chest' },
    })
    const ownCustom = await createExercise({
      data: { name: '自作種目', muscleGroup: 'arms', createdBy: ownerId },
    })
    await createExercise({
      data: { name: '他人の自作種目', muscleGroup: 'legs', createdBy: otherId },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/exercises')

    expect(res.status).toBe(200)
    const ids = (res.body as Array<{ id: string }>).map((e) => e.id)
    expect(ids).toEqual(expect.arrayContaining([official.id, ownCustom.id]))
    expect(ids).not.toContain('他人の自作種目')
    expect(res.body).toHaveLength(2)
  })

  it('自分の使用回数が多い種目ほど先に並ぶ', async () => {
    const usedTwice = await createExercise({
      data: { name: 'よく使う種目', muscleGroup: 'chest' },
    })
    const usedOnce = await createExercise({
      data: { name: 'たまに使う種目', muscleGroup: 'back' },
    })
    const unused = await createExercise({
      data: { name: '未使用種目', muscleGroup: 'legs' },
    })

    const workout = await prisma.workout.create({
      data: { userId: ownerId, performedAt: new Date('2026-09-01') },
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId: usedTwice.id, setOrder: 1, reps: 10 },
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId: usedTwice.id, setOrder: 2, reps: 8 },
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId: usedOnce.id, setOrder: 3, reps: 12 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/exercises')

    const order = (res.body as Array<{ id: string; useCount: number }>).map((e) => e.id)
    expect(order.indexOf(usedTwice.id)).toBeLessThan(order.indexOf(usedOnce.id))
    expect(order.indexOf(usedOnce.id)).toBeLessThan(order.indexOf(unused.id))
  })
})

describe('POST /exercises', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app)
      .post('/exercises')
      .send({ name: 'カスタム種目', muscleGroup: 'chest' })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'unauthenticated' })
  })

  it('バリデーションエラー(不正なmuscleGroup)なら400を返す', async () => {
    const agent = await loginAsOwner()
    const res = await agent
      .post('/exercises')
      .send({ name: 'カスタム種目', muscleGroup: 'invalid_group' })

    expect(res.status).toBe(400)
  })

  it('カスタム種目を追加できる(createdByが自分になる)', async () => {
    const agent = await loginAsOwner()
    const res = await agent
      .post('/exercises')
      .send({ name: 'カスタム種目', muscleGroup: 'chest', equipment: 'ダンベル' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'カスタム種目',
      muscleGroup: 'chest',
      muscleDetail: null,
      equipment: 'ダンベル',
      createdBy: ownerId,
    })
  })
})
