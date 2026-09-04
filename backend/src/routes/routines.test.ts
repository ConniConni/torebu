import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const ownerEmail = 'routines-owner-test@example.com'
const otherEmail = 'routines-other-test@example.com'
const testPassword = 'password123'

let ownerId: string
let otherId: string
let exerciseId: string
let othersExerciseId: string

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const owner = await prisma.user.create({
    data: { email: ownerEmail, passwordHash, displayName: 'ルーティンテストユーザー' },
  })
  const other = await prisma.user.create({
    data: { email: otherEmail, passwordHash, displayName: 'ルーティンテスト別ユーザー' },
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
  await prisma.routineExercise.deleteMany({
    where: { routine: { userId: { in: [ownerId, otherId] } } },
  })
  await prisma.routine.deleteMany({ where: { userId: { in: [ownerId, otherId] } } })
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

async function createRoutine(userId: string, overrides: { name?: string } = {}) {
  return prisma.routine.create({
    data: { userId, name: overrides.name ?? '胸の日' },
  })
}

describe('POST /routines', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).post('/routines').send({ name: '胸の日' })

    expect(res.status).toBe(401)
  })

  it('nameが無ければ400を返す', async () => {
    const agent = await loginAsOwner()
    const res = await agent.post('/routines').send({})

    expect(res.status).toBe(400)
  })

  it('routineを作成できる', async () => {
    const agent = await loginAsOwner()
    const res = await agent.post('/routines').send({ name: '胸の日' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.any(String),
      name: '胸の日',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })
})

describe('GET /routines', () => {
  it('自分のroutineのみ、作成日の新しい順に返る', async () => {
    const older = await createRoutine(ownerId, { name: '胸の日' })
    const newer = await createRoutine(ownerId, { name: '脚の日' })
    await createRoutine(otherId)

    const agent = await loginAsOwner()
    const res = await agent.get('/routines')

    expect(res.status).toBe(200)
    const ids = (res.body as Array<{ id: string }>).map((r) => r.id)
    expect(ids).toEqual([newer.id, older.id])
  })
})

describe('GET /routines/:id', () => {
  it('他人のroutineは404を返す', async () => {
    const routine = await createRoutine(otherId)

    const agent = await loginAsOwner()
    const res = await agent.get(`/routines/${routine.id}`)

    expect(res.status).toBe(404)
  })

  it('自分のroutineとexercisesをsortOrder順で返す', async () => {
    const routine = await createRoutine(ownerId)
    // sortOrderの昇順とは逆の順番でINSERTし、DB挿入順ではなくsortOrderで並んでいることを検証する
    // (種目は重複追加を弾いていないため、同じexerciseIdを2行使って良い。docs/backlog.md参照)
    const second = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId, sortOrder: 2 },
    })
    const first = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId, sortOrder: 1 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/routines/${routine.id}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(routine.id)
    const ids = (res.body.exercises as Array<{ id: string }>).map((e) => e.id)
    expect(ids).toEqual([first.id, second.id])
  })

  it('exercisesの各要素に種目名・部位が埋め込まれる', async () => {
    const routine = await createRoutine(ownerId)
    await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId, sortOrder: 1 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/routines/${routine.id}`)

    expect(res.status).toBe(200)
    expect(res.body.exercises[0]).toEqual({
      id: expect.any(String),
      routineId: routine.id,
      exerciseId,
      sortOrder: 1,
      targetSets: [],
      exercise: { id: exerciseId, name: 'ベンチプレス', muscleGroup: 'chest' },
    })
  })
})

describe('PATCH /routines/:id', () => {
  it('他人のroutineは404を返す', async () => {
    const routine = await createRoutine(otherId)

    const agent = await loginAsOwner()
    const res = await agent.patch(`/routines/${routine.id}`).send({ name: '書き換え' })

    expect(res.status).toBe(404)
  })

  it('nameが空なら400を返す', async () => {
    const routine = await createRoutine(ownerId)

    const agent = await loginAsOwner()
    const res = await agent.patch(`/routines/${routine.id}`).send({ name: '' })

    expect(res.status).toBe(400)
  })

  it('自分のroutineのnameを編集できる', async () => {
    const routine = await createRoutine(ownerId, { name: '元の名前' })

    const agent = await loginAsOwner()
    const res = await agent.patch(`/routines/${routine.id}`).send({ name: '書き換え後' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('書き換え後')
  })
})

describe('DELETE /routines/:id', () => {
  it('他人のroutineは404を返す', async () => {
    const routine = await createRoutine(otherId)

    const agent = await loginAsOwner()
    const res = await agent.delete(`/routines/${routine.id}`)

    expect(res.status).toBe(404)
  })

  it('自分のroutineを物理削除できる(行自体が消える・紐づくexercisesもCascadeで消える)', async () => {
    const routine = await createRoutine(ownerId)
    await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId, sortOrder: 1 },
    })

    const agent = await loginAsOwner()
    const deleteRes = await agent.delete(`/routines/${routine.id}`)
    expect(deleteRes.status).toBe(204)

    const stored = await prisma.routine.findUnique({ where: { id: routine.id } })
    expect(stored).toBeNull()

    const remainingExercises = await prisma.routineExercise.findMany({
      where: { routineId: routine.id },
    })
    expect(remainingExercises).toEqual([])
  })
})

describe('POST /routines/:id/exercises', () => {
  it('他人のroutineには追加できない(404)', async () => {
    const routine = await createRoutine(otherId)

    const agent = await loginAsOwner()
    const res = await agent
      .post(`/routines/${routine.id}/exercises`)
      .send({ exerciseId, sortOrder: 1 })

    expect(res.status).toBe(404)
  })

  it('バリデーションエラー(exerciseIdが無い)なら400を返す', async () => {
    const routine = await createRoutine(ownerId)

    const agent = await loginAsOwner()
    const res = await agent.post(`/routines/${routine.id}/exercises`).send({ sortOrder: 1 })

    expect(res.status).toBe(400)
  })

  it('バリデーションエラー(sortOrderが0以下)なら400を返す', async () => {
    const routine = await createRoutine(ownerId)

    const agent = await loginAsOwner()
    const res = await agent
      .post(`/routines/${routine.id}/exercises`)
      .send({ exerciseId, sortOrder: 0 })

    expect(res.status).toBe(400)
  })

  it('他人専用のカスタム種目は追加できない(400)', async () => {
    const routine = await createRoutine(ownerId)

    const agent = await loginAsOwner()
    const res = await agent
      .post(`/routines/${routine.id}/exercises`)
      .send({ exerciseId: othersExerciseId, sortOrder: 1 })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_exercise' })
  })

  it('自分のroutineに種目を追加できる', async () => {
    const routine = await createRoutine(ownerId)

    const agent = await loginAsOwner()
    const res = await agent
      .post(`/routines/${routine.id}/exercises`)
      .send({ exerciseId, sortOrder: 1 })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.any(String),
      routineId: routine.id,
      exerciseId,
      sortOrder: 1,
      targetSets: [],
    })
  })

  it('目安セット(targetSets)を指定して追加できる', async () => {
    const routine = await createRoutine(ownerId)

    const agent = await loginAsOwner()
    const res = await agent.post(`/routines/${routine.id}/exercises`).send({
      exerciseId,
      sortOrder: 1,
      targetSets: [
        { weightKg: 60, reps: 10 },
        { weightKg: null, reps: 8 }, // 自重扱い
      ],
    })

    expect(res.status).toBe(201)
    expect(res.body.targetSets).toEqual([
      { weightKg: 60, reps: 10 },
      { weightKg: null, reps: 8 },
    ])
  })

  it('目安セットの重量が0.5kg刻みでなければ400を返す', async () => {
    const routine = await createRoutine(ownerId)

    const agent = await loginAsOwner()
    const res = await agent
      .post(`/routines/${routine.id}/exercises`)
      .send({ exerciseId, sortOrder: 1, targetSets: [{ weightKg: 60.3, reps: 10 }] })

    expect(res.status).toBe(400)
  })
})

describe('PATCH /routines/:id/exercises/:routineExerciseId', () => {
  it('他人のroutineの種目は編集できない(404)', async () => {
    const routine = await createRoutine(otherId)
    const routineExercise = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId, sortOrder: 1 },
    })

    const agent = await loginAsOwner()
    const res = await agent
      .patch(`/routines/${routine.id}/exercises/${routineExercise.id}`)
      .send({ sortOrder: 2 })

    expect(res.status).toBe(404)
  })

  it('自分の別routineに属するroutineExerciseIdを指定すると404を返す', async () => {
    const routine = await createRoutine(ownerId, { name: '胸の日' })
    const otherOwnRoutine = await createRoutine(ownerId, { name: '脚の日' })
    // otherOwnRoutine(自分の別routine)に属するroutineExerciseIdを、routine(URL上のid)に対して指定する
    const routineExercise = await prisma.routineExercise.create({
      data: { routineId: otherOwnRoutine.id, exerciseId, sortOrder: 1 },
    })

    const agent = await loginAsOwner()
    const res = await agent
      .patch(`/routines/${routine.id}/exercises/${routineExercise.id}`)
      .send({ sortOrder: 2 })

    expect(res.status).toBe(404)
  })


  it('sortOrderを変更できる(並び替え)', async () => {
    const routine = await createRoutine(ownerId)
    const routineExercise = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId, sortOrder: 1 },
    })

    const agent = await loginAsOwner()
    const res = await agent
      .patch(`/routines/${routine.id}/exercises/${routineExercise.id}`)
      .send({ sortOrder: 2 })

    expect(res.status).toBe(200)
    expect(res.body.sortOrder).toBe(2)
  })

  it('targetSetsを更新できる(sortOrderは省略可)', async () => {
    const routine = await createRoutine(ownerId)
    const routineExercise = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId, sortOrder: 1 },
    })

    const agent = await loginAsOwner()
    const res = await agent
      .patch(`/routines/${routine.id}/exercises/${routineExercise.id}`)
      .send({ targetSets: [{ weightKg: 40, reps: 12 }] })

    expect(res.status).toBe(200)
    expect(res.body.targetSets).toEqual([{ weightKg: 40, reps: 12 }])
  })

  it('targetSetsを空配列にすると目安セットをクリアできる', async () => {
    const routine = await createRoutine(ownerId)
    const routineExercise = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId, sortOrder: 1, targetSets: [{ weightKg: 40, reps: 12 }] },
    })

    const agent = await loginAsOwner()
    const res = await agent
      .patch(`/routines/${routine.id}/exercises/${routineExercise.id}`)
      .send({ targetSets: [] })

    expect(res.status).toBe(200)
    expect(res.body.targetSets).toEqual([])
  })

  it('sortOrder・targetSetsのどちらも無ければ400を返す', async () => {
    const routine = await createRoutine(ownerId)
    const routineExercise = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId, sortOrder: 1 },
    })

    const agent = await loginAsOwner()
    const res = await agent
      .patch(`/routines/${routine.id}/exercises/${routineExercise.id}`)
      .send({})

    expect(res.status).toBe(400)
  })
})

describe('DELETE /routines/:id/exercises/:routineExerciseId', () => {
  it('他人のroutineの種目は削除できない(404)', async () => {
    const routine = await createRoutine(otherId)
    const routineExercise = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId, sortOrder: 1 },
    })

    const agent = await loginAsOwner()
    const res = await agent.delete(`/routines/${routine.id}/exercises/${routineExercise.id}`)

    expect(res.status).toBe(404)
  })

  it('自分の別routineに属するroutineExerciseIdを指定すると404を返す', async () => {
    const routine = await createRoutine(ownerId, { name: '胸の日' })
    const otherOwnRoutine = await createRoutine(ownerId, { name: '脚の日' })
    const routineExercise = await prisma.routineExercise.create({
      data: { routineId: otherOwnRoutine.id, exerciseId, sortOrder: 1 },
    })

    const agent = await loginAsOwner()
    const res = await agent.delete(`/routines/${routine.id}/exercises/${routineExercise.id}`)

    expect(res.status).toBe(404)
    // 404で弾かれ、削除処理自体が実行されていないことも確認する
    const stored = await prisma.routineExercise.findUnique({ where: { id: routineExercise.id } })
    expect(stored).not.toBeNull()
  })

  it('自分のroutineから種目を削除できる', async () => {
    const routine = await createRoutine(ownerId)
    const routineExercise = await prisma.routineExercise.create({
      data: { routineId: routine.id, exerciseId, sortOrder: 1 },
    })

    const agent = await loginAsOwner()
    const deleteRes = await agent.delete(`/routines/${routine.id}/exercises/${routineExercise.id}`)
    expect(deleteRes.status).toBe(204)

    const stored = await prisma.routineExercise.findUnique({ where: { id: routineExercise.id } })
    expect(stored).toBeNull()
  })
})

describe('別ユーザーからの操作', () => {
  it('otherユーザーはownerのroutineにアクセスできない', async () => {
    const routine = await createRoutine(ownerId)

    const agent = await loginAsOther()
    const res = await agent.get(`/routines/${routine.id}`)

    expect(res.status).toBe(404)
  })
})
