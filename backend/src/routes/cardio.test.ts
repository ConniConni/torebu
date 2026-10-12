import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'
import { todayInJst } from '../lib/date.js'
import officialExercises from '../../prisma/seed-data/official-exercises.json' with { type: 'json' }

// 有酸素運動の記録(Issue #345 PR1)。セットAPIの項目の切り替え、レスポンス、
// ランキング・ルーティン・自己ベストからの除外、記録日数への算入のテスト

const meEmail = 'cardio-me-test@example.com'
const mateEmail = 'cardio-mate-test@example.com'
const testPassword = 'password123'

let meId: string
let mateId: string
let strengthId: string
let runId: string
let bikeId: string
let groupId: string

const today = todayInJst()

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const me = await prisma.user.create({
    data: { email: meEmail, passwordHash, displayName: '有酸素テスト本人' },
  })
  const mate = await prisma.user.create({
    data: { email: mateEmail, passwordHash, displayName: '有酸素テスト仲間' },
  })
  meId = me.id
  mateId = mate.id

  // 公式種目(createdBy: null)として作る。seedの公式種目とは別物(名前もテスト専用)
  const strength = await prisma.exercise.create({
    data: { name: '有酸素テスト用筋トレ', muscleGroup: 'chest' },
  })
  const run = await prisma.exercise.create({
    data: { name: '有酸素テスト用ラン', muscleGroup: 'cardio', speedUnit: 'pace' },
  })
  const bike = await prisma.exercise.create({
    data: { name: '有酸素テスト用バイク', muscleGroup: 'cardio', speedUnit: 'kmh' },
  })
  strengthId = strength.id
  runId = run.id
  bikeId = bike.id

  const group = await prisma.group.create({
    data: { name: '有酸素テストグループ', createdBy: meId, inviteCode: `cd-${Math.random()}` },
  })
  groupId = group.id
  await prisma.groupMember.createMany({
    data: [
      { groupId, userId: meId, role: 'owner' },
      { groupId, userId: mateId, role: 'member' },
    ],
  })
})

afterEach(async () => {
  const userIds = [meId, mateId]
  await prisma.notification.deleteMany({ where: { recipientId: { in: userIds } } })
  await prisma.routineExercise.deleteMany({ where: { routine: { userId: { in: userIds } } } })
  await prisma.routine.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.groupMember.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.group.deleteMany({ where: { createdBy: meId } })
  await prisma.workoutSet.deleteMany({ where: { workout: { userId: { in: userIds } } } })
  await prisma.workoutExercise.deleteMany({ where: { workout: { userId: { in: userIds } } } })
  await prisma.workout.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.exercise.deleteMany({ where: { id: { in: [strengthId, runId, bikeId] } } })
  await prisma.exercise.deleteMany({ where: { createdBy: { in: userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
})

async function login(email: string) {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email, password: testPassword })
  return agent
}

type Agent = Awaited<ReturnType<typeof login>>

async function startWorkout(agent: Agent, performedAt = today) {
  const res = await agent.post('/workouts').send({ performedAt })
  return res.body.id as string
}

// 過去の「セットがある日」をDBに直接作る(APIを通さないため通知・判定は作られない)
async function createPastCardioDay(userId: string, performedAt: string) {
  const workout = await prisma.workout.create({
    data: { userId, performedAt: new Date(`${performedAt}T00:00:00Z`) },
  })
  await prisma.workoutSet.create({
    data: {
      workoutId: workout.id,
      exerciseId: runId,
      setOrder: 1,
      distanceKm: 5,
      durationSec: 1800,
    },
  })
  return workout
}

describe('POST /workouts/:id/sets（有酸素）', () => {
  it('距離・時間を保存でき、repsはnullで返る', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)

    const res = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, distanceKm: 5.25, durationSec: 1800 })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      exerciseId: runId,
      setOrder: 1,
      weightKg: null,
      reps: null,
      distanceKm: 5.25,
      durationSec: 1800,
      personalBest: null,
    })
  })

  it('距離だけ・時間だけでも保存できる', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)

    const distanceOnly = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, distanceKm: 3 })
    const durationOnly = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, durationSec: 600 })

    expect(distanceOnly.status).toBe(201)
    expect(distanceOnly.body).toMatchObject({ distanceKm: 3, durationSec: null })
    expect(durationOnly.status).toBe(201)
    expect(durationOnly.body).toMatchObject({ distanceKm: null, durationSec: 600, setOrder: 2 })
  })

  it('距離・時間とも省略しても空の1行として保存できる', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)

    const res = await agent.post(`/workouts/${workoutId}/sets`).send({ exerciseId: bikeId })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ reps: null, distanceKm: null, durationSec: null })
  })

  it('有酸素にweightKg・repsを送ると400', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)

    const withReps = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, reps: 10 })
    const withWeight = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, weightKg: 20 })

    expect(withReps.status).toBe(400)
    expect(withReps.body.error).toBe('invalid_request')
    expect(withWeight.status).toBe(400)
    expect(await prisma.workoutSet.count({ where: { workoutId } })).toBe(0)
  })

  it.each([
    ['距離が0', { distanceKm: 0 }],
    ['距離が負', { distanceKm: -1 }],
    ['距離が1000km', { distanceKm: 1000 }],
    ['距離が小数第3位', { distanceKm: 1.234 }],
    ['時間が0秒', { durationSec: 0 }],
    ['時間が60000秒', { durationSec: 60000 }],
    ['時間が小数', { durationSec: 1.5 }],
  ])('範囲外の値（%s）は400', async (_label, body) => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)

    const res = await agent.post(`/workouts/${workoutId}/sets`).send({ exerciseId: runId, ...body })

    expect(res.status).toBe(400)
  })

  it('上限ちょうどの値（999.99km・59999秒）は保存できる', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)

    const res = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, distanceKm: 999.99, durationSec: 59999 })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ distanceKm: 999.99, durationSec: 59999 })
  })
})

describe('PATCH /workouts/:id/sets/:setId（有酸素）', () => {
  async function createRunSet(agent: Agent) {
    const workoutId = await startWorkout(agent)
    const res = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, distanceKm: 5, durationSec: 1800 })
    return { workoutId, setId: res.body.id as string }
  }

  it('距離・時間を編集できる', async () => {
    const agent = await login(meEmail)
    const { workoutId, setId } = await createRunSet(agent)

    const res = await agent
      .patch(`/workouts/${workoutId}/sets/${setId}`)
      .send({ distanceKm: 10.5, durationSec: 3600 })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ distanceKm: 10.5, durationSec: 3600, reps: null })
    expect(res.body.personalBest).toBeNull()
  })

  it('nullを送るとその項目だけクリアされる', async () => {
    const agent = await login(meEmail)
    const { workoutId, setId } = await createRunSet(agent)

    const res = await agent
      .patch(`/workouts/${workoutId}/sets/${setId}`)
      .send({ durationSec: null })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ distanceKm: 5, durationSec: null })
  })

  it('両方クリアして空の行にできる', async () => {
    const agent = await login(meEmail)
    const { workoutId, setId } = await createRunSet(agent)

    const res = await agent
      .patch(`/workouts/${workoutId}/sets/${setId}`)
      .send({ distanceKm: null, durationSec: null })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ distanceKm: null, durationSec: null })
  })

  it('空のPATCHは400', async () => {
    const agent = await login(meEmail)
    const { workoutId, setId } = await createRunSet(agent)

    const res = await agent.patch(`/workouts/${workoutId}/sets/${setId}`).send({})

    expect(res.status).toBe(400)
  })

  it('weightKg・repsを送ると400で、値は変わらない', async () => {
    const agent = await login(meEmail)
    const { workoutId, setId } = await createRunSet(agent)

    const withReps = await agent.patch(`/workouts/${workoutId}/sets/${setId}`).send({ reps: 5 })
    const withWeight = await agent
      .patch(`/workouts/${workoutId}/sets/${setId}`)
      .send({ weightKg: 10 })

    expect(withReps.status).toBe(400)
    expect(withWeight.status).toBe(400)
    const stored = await prisma.workoutSet.findUniqueOrThrow({ where: { id: setId } })
    expect(stored.reps).toBeNull()
    expect(stored.weightKg).toBeNull()
  })

  it('範囲外の値は400', async () => {
    const agent = await login(meEmail)
    const { workoutId, setId } = await createRunSet(agent)

    const distance = await agent
      .patch(`/workouts/${workoutId}/sets/${setId}`)
      .send({ distanceKm: 1000 })
    const duration = await agent
      .patch(`/workouts/${workoutId}/sets/${setId}`)
      .send({ durationSec: 0 })

    expect(distance.status).toBe(400)
    expect(duration.status).toBe(400)
  })
})

describe('筋トレのセットAPI（従来どおり）', () => {
  it('distanceKm・durationSecを送ると400', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)

    const withDistance = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: strengthId, reps: 8, distanceKm: 5 })
    const withDuration = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: strengthId, reps: 8, durationSec: 60 })

    expect(withDistance.status).toBe(400)
    expect(withDuration.status).toBe(400)
  })

  it('POSTでrepsを省略すると400', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)

    const res = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: strengthId, weightKg: 50 })

    expect(res.status).toBe(400)
  })

  it('repsが0でも保存でき、距離・時間はnullで返る', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)

    const res = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: strengthId, weightKg: 50, reps: 0 })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      weightKg: 50,
      reps: 0,
      distanceKm: null,
      durationSec: null,
    })
  })

  it('PATCHで重量・回数は編集でき、distanceKmは400、reps: nullも400', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)
    const created = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: strengthId, weightKg: 50, reps: 8 })
    const url = `/workouts/${workoutId}/sets/${created.body.id}`

    const ok = await agent.patch(url).send({ weightKg: 55, reps: 10 })
    const withDistance = await agent.patch(url).send({ distanceKm: 3 })
    const nullReps = await agent.patch(url).send({ reps: null })

    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ weightKg: 55, reps: 10 })
    expect(withDistance.status).toBe(400)
    expect(nullReps.status).toBe(400)
  })
})

describe('レスポンスへの距離・時間', () => {
  it('GET /workouts/:id が有酸素の行に距離・時間を含め、筋トレの行はnullで返す', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)
    await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, distanceKm: 5.5, durationSec: 1980 })
    await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: strengthId, weightKg: 60, reps: 8 })

    const res = await agent.get(`/workouts/${workoutId}`)

    expect(res.status).toBe(200)
    const run = res.body.sets.find((s: { exerciseId: string }) => s.exerciseId === runId)
    const bench = res.body.sets.find((s: { exerciseId: string }) => s.exerciseId === strengthId)
    expect(run).toMatchObject({ reps: null, distanceKm: 5.5, durationSec: 1980 })
    expect(bench).toMatchObject({ weightKg: 60, reps: 8, distanceKm: null, durationSec: null })
  })

  it('GET /groups/:id/workouts（フィード）が仲間の有酸素の行に距離・時間を含める', async () => {
    const mate = await login(mateEmail)
    const workoutId = await startWorkout(mate)
    await mate
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, distanceKm: 4, durationSec: 1500 })

    const agent = await login(meEmail)
    const res = await agent.get(`/groups/${groupId}/workouts`)

    expect(res.status).toBe(200)
    const workout = res.body.find((w: { id: string }) => w.id === workoutId)
    expect(workout.exercises).toHaveLength(1)
    expect(workout.exercises[0].sets[0]).toMatchObject({
      reps: null,
      distanceKm: 4,
      durationSec: 1500,
    })
  })
})

describe('GET /exercises', () => {
  it('speedUnitを返す（有酸素のみ値あり、筋トレはnull）', async () => {
    const agent = await login(meEmail)

    const res = await agent.get('/exercises')

    expect(res.status).toBe(200)
    const byId = (id: string) => res.body.find((e: { id: string }) => e.id === id)
    expect(byId(runId)).toMatchObject({ muscleGroup: 'cardio', speedUnit: 'pace' })
    expect(byId(bikeId)).toMatchObject({ muscleGroup: 'cardio', speedUnit: 'kmh' })
    expect(byId(strengthId).speedUnit).toBeNull()
  })

  // DBのseed状態に依存しないよう、seedのデータソース(JSON)を直接検証する
  it('seedの公式有酸素3種目（ランニング・ウォーキング・エアロバイク）の速さの単位が正しい', () => {
    const cardio = (
      officialExercises as { main_body_part: string; name_ja: string; speed_unit?: string }[]
    ).filter((e) => e.main_body_part === '有酸素')

    expect(cardio.map((e) => [e.name_ja, e.speed_unit])).toEqual([
      ['ランニング', 'pace'],
      ['ウォーキング', 'pace'],
      ['エアロバイク', 'kmh'],
    ])
    expect(officialExercises).toHaveLength(81)
  })

  it('lastSetに有酸素の前回の距離・時間を返す', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)
    await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, distanceKm: 6.5, durationSec: 2400 })
    await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: strengthId, weightKg: 40, reps: 12 })

    const res = await agent.get('/exercises')

    const byId = (id: string) => res.body.find((e: { id: string }) => e.id === id)
    expect(byId(runId).lastSet).toEqual({
      weightKg: null,
      reps: null,
      distanceKm: 6.5,
      durationSec: 2400,
    })
    expect(byId(strengthId).lastSet).toEqual({
      weightKg: 40,
      reps: 12,
      distanceKm: null,
      durationSec: null,
    })
    expect(byId(bikeId).lastSet).toBeNull()
  })
})

describe('ランキングからの除外', () => {
  async function recordBoth(agent: Agent) {
    const workoutId = await startWorkout(agent)
    await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: strengthId, weightKg: 50, reps: 10 })
    await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, distanceKm: 5, durationSec: 1800 })
    return workoutId
  }

  it('合計ランキングは筋トレだけで計算される。有酸素だけのメンバーは0kgで、記録日数には数えられる', async () => {
    const me = await login(meEmail)
    await recordBoth(me)
    const mate = await login(mateEmail)
    const mateWorkoutId = await startWorkout(mate)
    await mate
      .post(`/workouts/${mateWorkoutId}/sets`)
      .send({ exerciseId: bikeId, distanceKm: 20, durationSec: 3000 })

    const res = await me.get(`/groups/${groupId}/ranking?period=all`)

    expect(res.status).toBe(200)
    const entry = (userId: string) =>
      res.body.ranking.find((r: { userId: string }) => r.userId === userId)
    expect(entry(meId)).toMatchObject({ totalVolumeKg: 500, daysTrained: 1, rank: 1 })
    expect(entry(mateId)).toMatchObject({
      totalVolumeKg: 0,
      daysTrained: 1,
      attendanceStamp: 'bronze',
      rank: 2,
    })
  })

  it('種目別ランキングで有酸素の種目IDを指定すると404', async () => {
    const me = await login(meEmail)

    const res = await me.get(`/groups/${groupId}/ranking?period=all&exerciseId=${runId}`)

    expect(res.status).toBe(404)
  })

  it('初期種目・種目一覧に有酸素が混ざらない', async () => {
    const me = await login(meEmail)
    // 有酸素のセット数を筋トレより多くしても、初期種目には選ばれない
    const workoutId = await startWorkout(me)
    await me
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: strengthId, weightKg: 50, reps: 10 })
    for (let i = 0; i < 3; i++) {
      await me.post(`/workouts/${workoutId}/sets`).send({ exerciseId: runId, distanceKm: 1 })
    }

    const defaultRes = await me.get(`/groups/${groupId}/ranking/default-exercise`)
    const listRes = await me.get(`/groups/${groupId}/ranking/exercises`)

    expect(defaultRes.body.exerciseId).toBe(strengthId)
    expect(listRes.body.exercises.map((e: { id: string }) => e.id)).toEqual([strengthId])
  })

  it('有酸素だけの記録しかないとき、初期種目はnull・種目一覧は空', async () => {
    const me = await login(meEmail)
    const workoutId = await startWorkout(me)
    await me.post(`/workouts/${workoutId}/sets`).send({ exerciseId: runId, distanceKm: 1 })

    const defaultRes = await me.get(`/groups/${groupId}/ranking/default-exercise`)
    const listRes = await me.get(`/groups/${groupId}/ranking/exercises`)

    expect(defaultRes.body.exerciseId).toBeNull()
    expect(listRes.body.exercises).toEqual([])
  })
})

describe('自己ベスト・記録日数', () => {
  it('有酸素のセットでは自己ベスト判定が発生せず、通知も作られない', async () => {
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent)

    const created = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, distanceKm: 5, durationSec: 1800 })
    const patched = await agent
      .patch(`/workouts/${workoutId}/sets/${created.body.id}`)
      .send({ distanceKm: 10 })

    expect(created.body.personalBest).toBeNull()
    expect(patched.body.personalBest).toBeNull()
    expect(await prisma.notification.count({ where: { type: 'personal_best' } })).toBe(0)
  })

  it('有酸素だけの日も通算日数に数えられ、節目（10日目）の通知が発火する', async () => {
    for (let i = 1; i <= 9; i++) {
      await createPastCardioDay(meId, `2026-01-${String(i).padStart(2, '0')}`)
    }
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent, '2026-01-10')

    const res = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, distanceKm: 5, durationSec: 1800 })

    expect(res.body.achievements).toMatchObject({ milestoneDays: 10 })
    const notifications = await prisma.notification.findMany({
      where: { type: 'milestone', actorId: meId },
    })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ recipientId: mateId, payload: { days: 10 } })
  })

  it('有酸素だけの日の久しぶりの復帰（comeback）通知が発火する', async () => {
    await createPastCardioDay(meId, '2026-01-01')
    const agent = await login(meEmail)
    const workoutId = await startWorkout(agent, today)

    const res = await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: runId, distanceKm: 5, durationSec: 1800 })

    expect(res.body.achievements.comeback).toBe(true)
    const notifications = await prisma.notification.findMany({
      where: { type: 'comeback', actorId: meId },
    })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ recipientId: mateId })
  })
})

describe('ルーティン・カスタム種目での拒否', () => {
  it('POST /routines/:id/exercises で有酸素を追加すると400', async () => {
    const agent = await login(meEmail)
    const routine = await agent.post('/routines').send({ name: '有酸素テストルーティン' })

    const cardio = await agent
      .post(`/routines/${routine.body.id}/exercises`)
      .send({ exerciseId: runId, sortOrder: 1 })
    const strength = await agent
      .post(`/routines/${routine.body.id}/exercises`)
      .send({ exerciseId: strengthId, sortOrder: 1 })

    expect(cardio.status).toBe(400)
    expect(cardio.body.error).toBe('invalid_exercise')
    expect(strength.status).toBe(201)
  })

  it('POST /exercises で muscleGroup: cardio のカスタム種目は作れない', async () => {
    const agent = await login(meEmail)

    const cardio = await agent
      .post('/exercises')
      .send({ name: '自作の有酸素', muscleGroup: 'cardio' })
    const strength = await agent
      .post('/exercises')
      .send({ name: '自作の筋トレ', muscleGroup: 'abs' })

    expect(cardio.status).toBe(400)
    expect(strength.status).toBe(201)
    expect(strength.body.speedUnit).toBeNull()
    expect(await prisma.exercise.count({ where: { createdBy: meId } })).toBe(1)
  })
})
