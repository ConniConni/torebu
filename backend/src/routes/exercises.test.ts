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
    const othersCustom = await createExercise({
      data: { name: '他人の自作種目', muscleGroup: 'legs', createdBy: otherId },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/exercises')

    expect(res.status).toBe(200)
    // DB全体の件数は他のテストファイルが並行して作る公式種目の影響を受けうるため検証しない。
    // 「見えるべきものが見えるか／見えるべきでないものが見えないか」だけをIDで検証する
    const ids = (res.body as Array<{ id: string }>).map((e) => e.id)
    expect(ids).toEqual(expect.arrayContaining([official.id, ownCustom.id]))
    expect(ids).not.toContain(othersCustom.id)
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

  it('使用回数が同じ場合はdefault_sort_order順→名前順で並ぶ(未使用ユーザーの初期表示、Issue #167)', async () => {
    // 名前順(50音順)だと「腹筋ローラー」が先頭に来てしまう並びを、defaultSortOrderで逆転させて検証する
    const isolation = await createExercise({
      data: { name: '腹筋ローラー', muscleGroup: 'chest', defaultSortOrder: 1 },
    })
    const compound = await createExercise({
      data: { name: 'ベンチプレス', muscleGroup: 'chest', defaultSortOrder: 0 },
    })
    // defaultSortOrder未設定(カスタム種目相当)は、設定済みの種目より後ろに来る
    const customLike = await createExercise({
      data: { name: 'アダプテッドプレス', muscleGroup: 'chest' },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/exercises')

    const order = (res.body as Array<{ id: string }>).map((e) => e.id)
    expect(order.indexOf(compound.id)).toBeLessThan(order.indexOf(isolation.id))
    expect(order.indexOf(isolation.id)).toBeLessThan(order.indexOf(customLike.id))
  })

  it('部位ハイライト用の項目(mainMuscle/relatedMuscles/mainZone)を返す。カスタム種目は全てnull', async () => {
    const official = await createExercise({
      data: {
        name: 'ベンチプレス(ハイライトテスト)',
        muscleGroup: 'chest',
        mainMuscle: '大胸筋',
        relatedMuscles: ['上腕三頭筋', '三角筋前部'],
        mainZone: 'mid',
      },
    })
    const custom = await createExercise({
      data: { name: '自作種目(ハイライトテスト)', muscleGroup: 'arms', createdBy: ownerId },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/exercises')

    const byId = new Map((res.body as Array<Record<string, unknown>>).map((e) => [e.id, e]))
    expect(byId.get(official.id)).toMatchObject({
      mainMuscle: '大胸筋',
      relatedMuscles: ['上腕三頭筋', '三角筋前部'],
      mainZone: 'mid',
    })
    expect(byId.get(custom.id)).toMatchObject({
      mainMuscle: null,
      relatedMuscles: [],
      mainZone: null,
    })
  })

  it('lastSetには直近のworkoutで記録した重量・回数が入り、記録が無い種目はnull', async () => {
    const exercise = await createExercise({
      data: { name: 'lastSetテスト種目', muscleGroup: 'chest' },
    })
    const unused = await createExercise({
      data: { name: '未使用種目(lastSetテスト)', muscleGroup: 'legs' },
    })
    const olderWorkout = await prisma.workout.create({
      data: { userId: ownerId, performedAt: new Date('2026-08-01') },
    })
    await prisma.workoutSet.create({
      data: {
        workoutId: olderWorkout.id,
        exerciseId: exercise.id,
        setOrder: 1,
        weightKg: 40,
        reps: 10,
      },
    })
    const newerWorkout = await prisma.workout.create({
      data: { userId: ownerId, performedAt: new Date('2026-09-01') },
    })
    await prisma.workoutSet.create({
      data: {
        workoutId: newerWorkout.id,
        exerciseId: exercise.id,
        setOrder: 1,
        weightKg: 50,
        reps: 8,
      },
    })
    await prisma.workoutSet.create({
      data: { workoutId: newerWorkout.id, exerciseId: exercise.id, setOrder: 2, reps: 12 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/exercises')

    const byId = new Map((res.body as Array<Record<string, unknown>>).map((e) => [e.id, e]))
    // 一番新しいworkout(9/1)の中で最後(setOrder2)のセットが返る
    expect(byId.get(exercise.id)).toMatchObject({ lastSet: { weightKg: null, reps: 12 } })
    expect(byId.get(unused.id)).toMatchObject({ lastSet: null })
  })

  it('lastSetは削除済み(ソフトデリート)のworkoutを見ない', async () => {
    const exercise = await createExercise({
      data: { name: 'lastSet削除除外テスト種目', muscleGroup: 'chest' },
    })
    const deletedWorkout = await prisma.workout.create({
      data: { userId: ownerId, performedAt: new Date('2026-09-01'), deletedAt: new Date() },
    })
    await prisma.workoutSet.create({
      data: {
        workoutId: deletedWorkout.id,
        exerciseId: exercise.id,
        setOrder: 1,
        weightKg: 99,
        reps: 1,
      },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/exercises')

    const found = (res.body as Array<{ id: string; lastSet: unknown }>).find(
      (e) => e.id === exercise.id,
    )
    expect(found?.lastSet).toBeNull()
  })

  it('使用回数が同点の場合は名前順(あいうえお順)に並ぶ', async () => {
    // 使用回数はどちらも0(未使用)のまま。名前だけを五十音順が崩れる並びで作る
    const wa = await createExercise({ data: { name: 'わ種目', muscleGroup: 'chest' } })
    const a = await createExercise({ data: { name: 'あ種目', muscleGroup: 'chest' } })
    const i = await createExercise({ data: { name: 'い種目', muscleGroup: 'chest' } })

    const agent = await loginAsOwner()
    const res = await agent.get('/exercises')

    const order = (res.body as Array<{ id: string }>).map((e) => e.id)
    expect(order.indexOf(a.id)).toBeLessThan(order.indexOf(i.id))
    expect(order.indexOf(i.id)).toBeLessThan(order.indexOf(wa.id))
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
      speedUnit: null,
      createdBy: ownerId,
      mainMuscle: null,
      relatedMuscles: [],
      mainZone: null,
      deletedAt: null,
      lastSet: null,
    })
  })
})

describe('DELETE /exercises/:id', () => {
  it('未ログインなら401を返す', async () => {
    const exercise = await createExercise({
      data: { name: '削除テスト種目', muscleGroup: 'chest', createdBy: ownerId },
    })

    const res = await request(app).delete(`/exercises/${exercise.id}`)

    expect(res.status).toBe(401)
  })

  it('自分のカスタム種目を削除できる(deletedAtが立つ)', async () => {
    const exercise = await createExercise({
      data: { name: '削除テスト種目', muscleGroup: 'chest', createdBy: ownerId },
    })

    const agent = await loginAsOwner()
    const res = await agent.delete(`/exercises/${exercise.id}`)

    expect(res.status).toBe(204)
    const updated = await prisma.exercise.findUniqueOrThrow({ where: { id: exercise.id } })
    expect(updated.deletedAt).not.toBeNull()
  })

  it('削除後もGET /exercisesのレスポンスには残る(過去記録の種目名解決のため)', async () => {
    const exercise = await createExercise({
      data: { name: '削除テスト種目', muscleGroup: 'chest', createdBy: ownerId },
    })

    const agent = await loginAsOwner()
    await agent.delete(`/exercises/${exercise.id}`)
    const res = await agent.get('/exercises')

    const found = (res.body as Array<{ id: string; deletedAt: string | null }>).find(
      (e) => e.id === exercise.id,
    )
    expect(found).toBeDefined()
    expect(found?.deletedAt).not.toBeNull()
  })

  it('他人のカスタム種目は削除できない(404)', async () => {
    const othersExercise = await createExercise({
      data: { name: '他人の種目', muscleGroup: 'chest', createdBy: otherId },
    })

    const agent = await loginAsOwner()
    const res = await agent.delete(`/exercises/${othersExercise.id}`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not_found' })
    const untouched = await prisma.exercise.findUniqueOrThrow({ where: { id: othersExercise.id } })
    expect(untouched.deletedAt).toBeNull()
  })

  it('公式種目は削除できない(404)', async () => {
    const official = await createExercise({
      data: { name: '公式種目(削除テスト)', muscleGroup: 'chest' },
    })

    const agent = await loginAsOwner()
    const res = await agent.delete(`/exercises/${official.id}`)

    expect(res.status).toBe(404)
    const untouched = await prisma.exercise.findUniqueOrThrow({ where: { id: official.id } })
    expect(untouched.deletedAt).toBeNull()
  })

  it('存在しない種目IDは404', async () => {
    const agent = await loginAsOwner()
    const res = await agent.delete('/exercises/00000000-0000-0000-0000-000000000000')

    expect(res.status).toBe(404)
  })

  it('既に削除済みの種目を再度削除しようとすると404', async () => {
    const exercise = await createExercise({
      data: { name: '削除テスト種目', muscleGroup: 'chest', createdBy: ownerId },
    })

    const agent = await loginAsOwner()
    await agent.delete(`/exercises/${exercise.id}`)
    const res = await agent.delete(`/exercises/${exercise.id}`)

    expect(res.status).toBe(404)
  })
})

describe('GET /exercises/:exerciseId/previous-session', () => {
  async function createWorkoutWithSets(
    userId: string,
    exerciseId: string,
    performedAt: string,
    sets: Array<{ weightKg?: number; reps: number }>,
    extra: { createdAt?: Date; deletedAt?: Date } = {},
  ) {
    const workout = await prisma.workout.create({
      data: { userId, performedAt: new Date(performedAt), ...extra },
    })
    for (const [index, set] of sets.entries()) {
      await prisma.workoutSet.create({
        data: { workoutId: workout.id, exerciseId, setOrder: index + 1, ...set },
      })
    }
    return workout
  }

  it('未ログインなら401を返す', async () => {
    const exercise = await createExercise({
      data: { name: '前回テスト種目', muscleGroup: 'chest' },
    })

    const res = await request(app).get(
      `/exercises/${exercise.id}/previous-session?before=2026-10-14`,
    )

    expect(res.status).toBe(401)
  })

  it('beforeが無い・不正な日付なら400を返す', async () => {
    const exercise = await createExercise({
      data: { name: '前回テスト種目', muscleGroup: 'chest' },
    })
    const agent = await loginAsOwner()

    for (const query of ['', '?before=2026/10/14', '?before=2026-02-30']) {
      const res = await agent.get(`/exercises/${exercise.id}/previous-session${query}`)
      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ error: 'invalid_request' })
    }
  })

  it('対象日より前の直近の日付の全セットを並び順どおりに返す(他人のworkoutは混ざらない)', async () => {
    const exercise = await createExercise({
      data: { name: '前回テスト種目', muscleGroup: 'chest' },
    })
    await createWorkoutWithSets(ownerId, exercise.id, '2026-10-01', [{ weightKg: 50, reps: 10 }])
    await createWorkoutWithSets(ownerId, exercise.id, '2026-10-10', [
      { weightKg: 60, reps: 8 },
      { weightKg: 60, reps: 8 },
      { weightKg: 57.5, reps: 7 },
    ])
    // 他人の記録の方が対象日に近くても見ない
    await createWorkoutWithSets(otherId, exercise.id, '2026-10-12', [{ weightKg: 100, reps: 1 }])

    const agent = await loginAsOwner()
    const res = await agent.get(`/exercises/${exercise.id}/previous-session?before=2026-10-14`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      performedAt: '2026-10-10',
      sets: [
        { weightKg: 60, reps: 8 },
        { weightKg: 60, reps: 8 },
        { weightKg: 57.5, reps: 7 },
      ],
    })
  })

  it('対象日当日のセットは含めない', async () => {
    const exercise = await createExercise({
      data: { name: '前回テスト種目', muscleGroup: 'chest' },
    })
    await createWorkoutWithSets(ownerId, exercise.id, '2026-10-10', [{ weightKg: 60, reps: 8 }])
    await createWorkoutWithSets(ownerId, exercise.id, '2026-10-14', [{ weightKg: 70, reps: 5 }])

    const agent = await loginAsOwner()
    const res = await agent.get(`/exercises/${exercise.id}/previous-session?before=2026-10-14`)

    expect(res.body).toEqual({ performedAt: '2026-10-10', sets: [{ weightKg: 60, reps: 8 }] })
  })

  it('削除済みのworkoutは見ない', async () => {
    const exercise = await createExercise({
      data: { name: '前回テスト種目', muscleGroup: 'chest' },
    })
    await createWorkoutWithSets(ownerId, exercise.id, '2026-10-05', [{ weightKg: 55, reps: 10 }])
    await createWorkoutWithSets(ownerId, exercise.id, '2026-10-10', [{ weightKg: 99, reps: 1 }], {
      deletedAt: new Date(),
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/exercises/${exercise.id}/previous-session?before=2026-10-14`)

    expect(res.body).toEqual({ performedAt: '2026-10-05', sets: [{ weightKg: 55, reps: 10 }] })
  })

  it('同じ日に複数のworkoutがあれば、workoutの作成順→setOrder順に連結する', async () => {
    const exercise = await createExercise({
      data: { name: '前回テスト種目', muscleGroup: 'chest' },
    })
    // 挿入順・setOrderの値に頼らず作成日時で並ぶことを確かめるため、後から作られた方を先に登録する
    await createWorkoutWithSets(ownerId, exercise.id, '2026-10-10', [{ weightKg: 40, reps: 12 }], {
      createdAt: new Date('2026-10-10T12:00:00Z'),
    })
    await createWorkoutWithSets(
      ownerId,
      exercise.id,
      '2026-10-10',
      [{ weightKg: 60, reps: 8 }, { reps: 15 }],
      { createdAt: new Date('2026-10-10T09:00:00Z') },
    )

    const agent = await loginAsOwner()
    const res = await agent.get(`/exercises/${exercise.id}/previous-session?before=2026-10-14`)

    expect(res.body).toEqual({
      performedAt: '2026-10-10',
      sets: [
        { weightKg: 60, reps: 8 },
        { weightKg: null, reps: 15 },
        { weightKg: 40, reps: 12 },
      ],
    })
  })

  it('前回が無ければnullを返す', async () => {
    const exercise = await createExercise({
      data: { name: '前回テスト種目', muscleGroup: 'chest' },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/exercises/${exercise.id}/previous-session?before=2026-10-14`)

    expect(res.status).toBe(200)
    expect(res.text).toBe('null')
  })

  it('自分のカスタム種目は削除済みでも引ける', async () => {
    const exercise = await createExercise({
      data: {
        name: '削除済み自作種目',
        muscleGroup: 'arms',
        createdBy: ownerId,
        deletedAt: new Date(),
      },
    })
    await createWorkoutWithSets(ownerId, exercise.id, '2026-10-10', [{ weightKg: 20, reps: 10 }])

    const agent = await loginAsOwner()
    const res = await agent.get(`/exercises/${exercise.id}/previous-session?before=2026-10-14`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ performedAt: '2026-10-10', sets: [{ weightKg: 20, reps: 10 }] })
  })

  it('他人のカスタム種目・存在しない種目は404', async () => {
    const othersExercise = await createExercise({
      data: { name: '他人の自作種目', muscleGroup: 'arms', createdBy: otherId },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(
      `/exercises/${othersExercise.id}/previous-session?before=2026-10-14`,
    )
    const missing = await agent.get(
      '/exercises/00000000-0000-0000-0000-000000000000/previous-session?before=2026-10-14',
    )

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not_found' })
    expect(missing.status).toBe(404)
  })

  it('有酸素の種目は400 invalid_exercise', async () => {
    const cardio = await createExercise({
      data: { name: 'ランニング(前回テスト)', muscleGroup: 'cardio', speedUnit: 'pace' },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/exercises/${cardio.id}/previous-session?before=2026-10-14`)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_exercise' })
  })
})
