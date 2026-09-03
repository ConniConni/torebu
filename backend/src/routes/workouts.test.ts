import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const ownerEmail = 'workouts-owner-test@example.com'
const otherEmail = 'workouts-other-test@example.com'
const testPassword = 'password123'

let ownerId: string
let otherId: string
let exerciseId: string
let othersExerciseId: string

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const owner = await prisma.user.create({
    data: { email: ownerEmail, passwordHash, displayName: '記録テストユーザー' },
  })
  const other = await prisma.user.create({
    data: { email: otherEmail, passwordHash, displayName: '記録テスト別ユーザー' },
  })
  ownerId = owner.id
  otherId = other.id

  const exercise = await prisma.exercise.create({
    data: { name: 'ベンチプレス', muscleGroup: 'chest' },
  })
  exerciseId = exercise.id
  const othersExercise = await prisma.exercise.create({
    data: { name: '他人の自作種目', muscleGroup: 'legs', createdBy: otherId },
  })
  othersExerciseId = othersExercise.id
})

afterEach(async () => {
  await prisma.workoutSet.deleteMany({
    where: { workout: { userId: { in: [ownerId, otherId] } } },
  })
  await prisma.workout.deleteMany({ where: { userId: { in: [ownerId, otherId] } } })
  await prisma.exercise.deleteMany({ where: { id: { in: [exerciseId, othersExerciseId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } })
  // 他ファイルと共有のsessionテーブル全体を消すと並行実行中の他テストのログイン状態を壊すため、
  // ここでは削除しない(セッションはuserId削除に伴い次回アクセス時に無効化される)
})

async function loginAsOwner() {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email: ownerEmail, password: testPassword })
  return agent
}

async function loginAsOther() {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email: otherEmail, password: testPassword })
  return agent
}

async function createWorkout(
  userId: string,
  overrides: { performedAt?: Date; memo?: string } = {},
) {
  return prisma.workout.create({
    data: {
      userId,
      performedAt: overrides.performedAt ?? new Date('2026-09-01'),
      memo: overrides.memo,
    },
  })
}

describe('POST /workouts', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).post('/workouts').send({ performedAt: '2026-09-01' })

    expect(res.status).toBe(401)
  })

  it('performedAtが無ければ400を返す', async () => {
    const agent = await loginAsOwner()
    const res = await agent.post('/workouts').send({})

    expect(res.status).toBe(400)
  })

  it('workoutを作成できる', async () => {
    const agent = await loginAsOwner()
    const res = await agent.post('/workouts').send({ performedAt: '2026-09-01', memo: '胸の日' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.any(String),
      performedAt: '2026-09-01',
      memo: '胸の日',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })
})

describe('GET /workouts', () => {
  it('自分のworkoutのみ、実施日の新しい順に返る', async () => {
    const older = await createWorkout(ownerId, { performedAt: new Date('2026-08-01') })
    const newer = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await createWorkout(otherId)

    const agent = await loginAsOwner()
    const res = await agent.get('/workouts')

    expect(res.status).toBe(200)
    const ids = (res.body as Array<{ id: string }>).map((w) => w.id)
    expect(ids).toEqual([newer.id, older.id])
  })

  it('ソフトデリート済みのworkoutは含まれない', async () => {
    const deleted = await createWorkout(ownerId)
    await prisma.workout.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } })

    const agent = await loginAsOwner()
    const res = await agent.get('/workouts')

    const ids = (res.body as Array<{ id: string }>).map((w) => w.id)
    expect(ids).not.toContain(deleted.id)
  })
})

describe('GET /workouts/:id', () => {
  it('他人のworkoutは404を返す', async () => {
    const workout = await createWorkout(otherId)

    const agent = await loginAsOwner()
    const res = await agent.get(`/workouts/${workout.id}`)

    expect(res.status).toBe(404)
  })

  it('自分のworkoutとsetsを返す', async () => {
    const workout = await createWorkout(ownerId)
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 60 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/workouts/${workout.id}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(workout.id)
    expect(res.body.sets).toEqual([
      expect.objectContaining({ exerciseId, setOrder: 1, reps: 10, weightKg: 60 }),
    ])
  })
})

describe('PATCH /workouts/:id', () => {
  it('他人のworkoutは404を返す', async () => {
    const workout = await createWorkout(otherId)

    const agent = await loginAsOwner()
    const res = await agent.patch(`/workouts/${workout.id}`).send({ memo: '書き換え' })

    expect(res.status).toBe(404)
  })

  it('自分のworkoutのmemoを編集できる', async () => {
    const workout = await createWorkout(ownerId, { memo: '元のメモ' })

    const agent = await loginAsOwner()
    const res = await agent.patch(`/workouts/${workout.id}`).send({ memo: '書き換え後' })

    expect(res.status).toBe(200)
    expect(res.body.memo).toBe('書き換え後')
  })

  it('自分のworkoutのperformedAtを編集できる(記録日の入力ミス修正)', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })

    const agent = await loginAsOwner()
    const res = await agent.patch(`/workouts/${workout.id}`).send({ performedAt: '2026-08-31' })

    expect(res.status).toBe(200)
    expect(res.body.performedAt).toBe('2026-08-31')
  })

  it('performedAt・memoのどちらも指定しなければ400を返す', async () => {
    const workout = await createWorkout(ownerId)

    const agent = await loginAsOwner()
    const res = await agent.patch(`/workouts/${workout.id}`).send({})

    expect(res.status).toBe(400)
  })
})

describe('DELETE /workouts/:id', () => {
  it('他人のworkoutは404を返す', async () => {
    const workout = await createWorkout(otherId)

    const agent = await loginAsOwner()
    const res = await agent.delete(`/workouts/${workout.id}`)

    expect(res.status).toBe(404)
  })

  it('自分のworkoutをソフトデリートできる(以後GETで見えなくなる)', async () => {
    const workout = await createWorkout(ownerId)

    const agent = await loginAsOwner()
    const deleteRes = await agent.delete(`/workouts/${workout.id}`)
    expect(deleteRes.status).toBe(204)

    const getRes = await agent.get(`/workouts/${workout.id}`)
    expect(getRes.status).toBe(404)

    const stored = await prisma.workout.findUnique({ where: { id: workout.id } })
    // 物理削除(行自体が消える)ではなくソフトデリート(行は残りdeletedAtが入る)であることを検証する。
    // stored?.deletedAtだけだと、行が物理削除されてstoredがnullの場合もundefined !== nullで
    // 誤って成立してしまうため、まず行自体が残っていることを確認する
    expect(stored).not.toBeNull()
    expect(stored?.deletedAt).not.toBeNull()
  })
})

describe('POST /workouts/:id/sets', () => {
  it('他人のworkoutには追加できない(404)', async () => {
    const workout = await createWorkout(otherId)

    const agent = await loginAsOwner()
    const res = await agent
      .post(`/workouts/${workout.id}/sets`)
      .send({ exerciseId, setOrder: 1, reps: 10 })

    expect(res.status).toBe(404)
  })

  it('他人のカスタム種目は指定できない(400)', async () => {
    const workout = await createWorkout(ownerId)

    const agent = await loginAsOwner()
    const res = await agent
      .post(`/workouts/${workout.id}/sets`)
      .send({ exerciseId: othersExerciseId, setOrder: 1, reps: 10 })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_exercise' })
  })

  it('バリデーションエラー(exerciseIdが無い)なら400を返す', async () => {
    const workout = await createWorkout(ownerId)

    const agent = await loginAsOwner()
    const res = await agent.post(`/workouts/${workout.id}/sets`).send({ setOrder: 1, reps: 10 })

    expect(res.status).toBe(400)
  })

  it('setを追加できる(自重種目はweightKgがnull)', async () => {
    const workout = await createWorkout(ownerId)

    const agent = await loginAsOwner()
    const res = await agent
      .post(`/workouts/${workout.id}/sets`)
      .send({ exerciseId, setOrder: 1, reps: 12 })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.any(String),
      workoutId: workout.id,
      exerciseId,
      setOrder: 1,
      weightKg: null,
      reps: 12,
    })
  })

  it('同じ種目の2set目はsetOrderが自動的に2になる(クライアント指定は不要)', async () => {
    const workout = await createWorkout(ownerId)

    const agent = await loginAsOwner()
    await agent.post(`/workouts/${workout.id}/sets`).send({ exerciseId, reps: 12 })
    const res = await agent.post(`/workouts/${workout.id}/sets`).send({ exerciseId, reps: 10 })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ setOrder: 2 })
  })

  it('setOrderが欠番になっても次のsetOrderは既存の最大値+1になる', async () => {
    const workout = await createWorkout(ownerId)
    const first = await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10 },
    })
    await prisma.workoutSet.create({ data: { workoutId: workout.id, exerciseId, setOrder: 2, reps: 10 } })
    await prisma.workoutSet.delete({ where: { id: first.id } })

    const agent = await loginAsOwner()
    const res = await agent.post(`/workouts/${workout.id}/sets`).send({ exerciseId, reps: 10 })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ setOrder: 3 })
  })

  it('weightKgが上限(999.9kg)を超えると400を返す', async () => {
    const workout = await createWorkout(ownerId)

    const agent = await loginAsOwner()
    const res = await agent.post(`/workouts/${workout.id}/sets`).send({ exerciseId, reps: 10, weightKg: 1000 })

    expect(res.status).toBe(400)
  })

  it('weightKgが小数第2位以下だと400を返す', async () => {
    const workout = await createWorkout(ownerId)

    const agent = await loginAsOwner()
    const res = await agent
      .post(`/workouts/${workout.id}/sets`)
      .send({ exerciseId, reps: 10, weightKg: 60.25 })

    expect(res.status).toBe(400)
  })
})

describe('PATCH /workouts/:id/sets/:setId', () => {
  it('他人のworkoutのsetは404を返す', async () => {
    const workout = await createWorkout(otherId)
    const set = await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10 },
    })

    const agent = await loginAsOwner()
    const res = await agent.patch(`/workouts/${workout.id}/sets/${set.id}`).send({ reps: 8 })

    expect(res.status).toBe(404)
  })

  it('自分の別workoutに属するsetIdを指定すると404を返す', async () => {
    const ownWorkout = await createWorkout(ownerId)
    const anotherOwnWorkout = await createWorkout(ownerId)
    const setOfAnotherWorkout = await prisma.workoutSet.create({
      data: { workoutId: anotherOwnWorkout.id, exerciseId, setOrder: 1, reps: 10 },
    })

    const agent = await loginAsOwner()
    const res = await agent
      .patch(`/workouts/${ownWorkout.id}/sets/${setOfAnotherWorkout.id}`)
      .send({ reps: 8 })

    expect(res.status).toBe(404)
  })

  it('バリデーションエラー(repsが0以下)なら400を返す', async () => {
    const workout = await createWorkout(ownerId)
    const set = await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10 },
    })

    const agent = await loginAsOwner()
    const res = await agent.patch(`/workouts/${workout.id}/sets/${set.id}`).send({ reps: 0 })

    expect(res.status).toBe(400)
  })

  it('weightKg・repsのいずれも指定しなければ400を返す', async () => {
    const workout = await createWorkout(ownerId)
    const set = await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10 },
    })

    const agent = await loginAsOwner()
    const res = await agent.patch(`/workouts/${workout.id}/sets/${set.id}`).send({})

    expect(res.status).toBe(400)
  })

  it('自分のsetを編集できる', async () => {
    const workout = await createWorkout(ownerId)
    const set = await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 40 },
    })

    const agent = await loginAsOwner()
    const res = await agent
      .patch(`/workouts/${workout.id}/sets/${set.id}`)
      .send({ reps: 8, weightKg: 45 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(expect.objectContaining({ id: set.id, reps: 8, weightKg: 45 }))
  })
})

describe('DELETE /workouts/:id/sets/:setId', () => {
  it('他人のworkoutのsetは404を返す', async () => {
    const workout = await createWorkout(otherId)
    const set = await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10 },
    })

    const agent = await loginAsOwner()
    const res = await agent.delete(`/workouts/${workout.id}/sets/${set.id}`)

    expect(res.status).toBe(404)
  })

  it('自分の別workoutに属するsetIdを指定すると404を返す', async () => {
    const ownWorkout = await createWorkout(ownerId)
    const anotherOwnWorkout = await createWorkout(ownerId)
    const setOfAnotherWorkout = await prisma.workoutSet.create({
      data: { workoutId: anotherOwnWorkout.id, exerciseId, setOrder: 1, reps: 10 },
    })

    const agent = await loginAsOwner()
    const res = await agent.delete(`/workouts/${ownWorkout.id}/sets/${setOfAnotherWorkout.id}`)

    expect(res.status).toBe(404)

    const stored = await prisma.workoutSet.findUnique({ where: { id: setOfAnotherWorkout.id } })
    expect(stored).not.toBeNull()
  })

  it('自分のsetを削除できる', async () => {
    const workout = await createWorkout(ownerId)
    const set = await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10 },
    })

    const agent = await loginAsOwner()
    const res = await agent.delete(`/workouts/${workout.id}/sets/${set.id}`)
    expect(res.status).toBe(204)

    const stored = await prisma.workoutSet.findUnique({ where: { id: set.id } })
    expect(stored).toBeNull()
  })
})

describe('別ユーザーからの操作', () => {
  it('otherユーザーはownerのworkoutにアクセスできない', async () => {
    const workout = await createWorkout(ownerId)

    const agent = await loginAsOther()
    const res = await agent.get(`/workouts/${workout.id}`)

    expect(res.status).toBe(404)
  })
})
