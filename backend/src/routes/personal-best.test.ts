import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

// 自己ベスト更新(Issue #253)。本人への保存APIの応答(personalBest)と、仲間へのpersonal_best通知のテスト

const lifterEmail = 'personal-best-lifter-test@example.com'
const mateEmail = 'personal-best-mate-test@example.com'
const outsiderEmail = 'personal-best-outsider-test@example.com'
const testPassword = 'password123'

let lifterId: string
let mateId: string
let outsiderId: string
let exerciseId: string
let groupId: string
let secondGroupId: string

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const lifter = await prisma.user.create({
    data: { email: lifterEmail, passwordHash, displayName: '自己ベストテスト本人' },
  })
  const mate = await prisma.user.create({
    data: { email: mateEmail, passwordHash, displayName: '自己ベストテスト仲間' },
  })
  // 本人とグループを共有していないユーザー(別のグループにだけ所属している)
  const outsider = await prisma.user.create({
    data: { email: outsiderEmail, passwordHash, displayName: '自己ベストテスト部外者' },
  })
  lifterId = lifter.id
  mateId = mate.id
  outsiderId = outsider.id

  const exercise = await prisma.exercise.create({
    data: { name: '自己ベストテスト種目', muscleGroup: 'chest' },
  })
  exerciseId = exercise.id

  // 本人と仲間は2つのグループで同席している(宛先の重複排除の確認用)
  const group = await prisma.group.create({
    data: {
      name: '自己ベストテストグループ',
      createdBy: lifterId,
      inviteCode: `pb-${Math.random()}`,
    },
  })
  const secondGroup = await prisma.group.create({
    data: {
      name: '自己ベストテストグループ2',
      createdBy: lifterId,
      inviteCode: `pb-${Math.random()}`,
    },
  })
  const outsiderGroup = await prisma.group.create({
    data: {
      name: '自己ベストテスト別グループ',
      createdBy: lifterId,
      inviteCode: `pb-${Math.random()}`,
    },
  })
  groupId = group.id
  secondGroupId = secondGroup.id
  await prisma.groupMember.createMany({
    data: [
      { groupId, userId: lifterId, role: 'owner' },
      { groupId, userId: mateId, role: 'member' },
      { groupId: secondGroupId, userId: lifterId, role: 'owner' },
      { groupId: secondGroupId, userId: mateId, role: 'member' },
      { groupId: outsiderGroup.id, userId: outsiderId, role: 'owner' },
    ],
  })
})

afterEach(async () => {
  const userIds = [lifterId, mateId, outsiderId]
  await prisma.notification.deleteMany({ where: { recipientId: { in: userIds } } })
  await prisma.groupMember.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.group.deleteMany({ where: { createdBy: lifterId } })
  await prisma.workoutSet.deleteMany({ where: { workout: { userId: { in: userIds } } } })
  await prisma.workoutExercise.deleteMany({ where: { workout: { userId: { in: userIds } } } })
  await prisma.workout.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.exercise.deleteMany({ where: { id: exerciseId } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
})

async function login(email: string) {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email, password: testPassword })
  return agent
}

// 過去の記録をDBに直接作る(APIを通さないため通知は作られない)
async function createPastWorkout(performedAt: string, weights: (number | null)[]) {
  const workout = await prisma.workout.create({
    data: { userId: lifterId, performedAt: new Date(performedAt) },
  })
  for (const [index, weightKg] of weights.entries()) {
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: index + 1, weightKg, reps: 8 },
    })
  }
  return workout
}

// 本人が今日の記録を作り、APIでセットを追加する
async function startWorkout(agent: Awaited<ReturnType<typeof login>>, performedAt = '2026-09-20') {
  const res = await agent.post('/workouts').send({ performedAt })
  return res.body.id as string
}

async function addSet(
  agent: Awaited<ReturnType<typeof login>>,
  workoutId: string,
  weightKg?: number,
) {
  return agent.post(`/workouts/${workoutId}/sets`).send({ exerciseId, reps: 8, weightKg })
}

async function shiftNotificationsToPast(minutes: number) {
  await prisma.notification.updateMany({
    where: { type: 'personal_best', actorId: lifterId },
    data: { createdAt: new Date(Date.now() - minutes * 60 * 1000) },
  })
}

function personalBestNotifications() {
  return prisma.notification.findMany({ where: { type: 'personal_best', actorId: lifterId } })
}

describe('セット保存時の自己ベスト判定(本人への応答)', () => {
  it('他の記録の最大重量を上回ったら、応答にpersonalBestを返す', async () => {
    await createPastWorkout('2026-09-01', [80, 90])
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent)

    const res = await addSet(agent, workoutId, 95)

    expect(res.status).toBe(201)
    expect(res.body.personalBest).toEqual({ exerciseId, weightKg: 95, previousBestKg: 90 })
  })

  it('最大重量と同じ・下回る場合はnull', async () => {
    await createPastWorkout('2026-09-01', [90])
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent)

    const same = await addSet(agent, workoutId, 90)
    const lower = await addSet(agent, workoutId, 85)

    expect(same.body.personalBest).toBeNull()
    expect(lower.body.personalBest).toBeNull()
    expect(await personalBestNotifications()).toHaveLength(0)
  })

  it('初めて記録した種目は対象外', async () => {
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent)

    const res = await addSet(agent, workoutId, 100)

    expect(res.body.personalBest).toBeNull()
    expect(await personalBestNotifications()).toHaveLength(0)
  })

  it('自重(重量が空欄)のセットは対象外。過去が自重だけの種目も比べる相手が無いため対象外', async () => {
    await createPastWorkout('2026-09-01', [null, null])
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent)

    const bodyweight = await addSet(agent, workoutId)
    const weighted = await addSet(agent, workoutId, 10)

    expect(bodyweight.body.personalBest).toBeNull()
    expect(weighted.body.personalBest).toBeNull()
    expect(await personalBestNotifications()).toHaveLength(0)
  })

  it('同じ記録内の前のセットも含めた最高重量を上回るたびに返す', async () => {
    await createPastWorkout('2026-09-01', [90])
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent)

    const first = await addSet(agent, workoutId, 100)
    const second = await addSet(agent, workoutId, 95)
    const third = await addSet(agent, workoutId, 105)

    expect(first.body.personalBest).toEqual({ exerciseId, weightKg: 100, previousBestKg: 90 })
    expect(second.body.personalBest).toBeNull()
    expect(third.body.personalBest).toEqual({ exerciseId, weightKg: 105, previousBestKg: 100 })
  })

  it('削除済みの記録の重量とは比べない', async () => {
    await createPastWorkout('2026-09-01', [90])
    const deleted = await createPastWorkout('2026-09-02', [120])
    await prisma.workout.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } })
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent)

    const res = await addSet(agent, workoutId, 100)

    expect(res.body.personalBest).toEqual({ exerciseId, weightKg: 100, previousBestKg: 90 })
  })

  it('PATCHで重量を上げて上回ったら返す。重量が変わらない編集(回数のみ)では返さない', async () => {
    await createPastWorkout('2026-09-01', [90])
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent)
    const setId = (await addSet(agent, workoutId, 80)).body.id

    const raised = await agent
      .patch(`/workouts/${workoutId}/sets/${setId}`)
      .send({ weightKg: 92.5, reps: 8 })
    const repsOnly = await agent
      .patch(`/workouts/${workoutId}/sets/${setId}`)
      .send({ weightKg: 92.5, reps: 6 })

    expect(raised.status).toBe(200)
    expect(raised.body.personalBest).toEqual({ exerciseId, weightKg: 92.5, previousBestKg: 90 })
    expect(repsOnly.body.personalBest).toBeNull()
  })
})

describe('personal_best通知の作成', () => {
  it('所属するアクティブなグループのメンバー宛に、受信者ごとに1件だけ作る(本人・グループ外には作らない)', async () => {
    await createPastWorkout('2026-09-01', [90])
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent)

    await addSet(agent, workoutId, 100)

    const notifications = await personalBestNotifications()
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      recipientId: mateId,
      targetType: 'workout',
      targetId: workoutId,
      payload: { exerciseId, previousBestKg: 90 },
    })
  })

  it('同じ記録の同じ種目では、さらに更新しても2件目を作らない(更新前のベストは最初の値のまま)', async () => {
    await createPastWorkout('2026-09-01', [90])
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent)

    const setId = (await addSet(agent, workoutId, 100)).body.id
    await addSet(agent, workoutId, 105)
    await agent.patch(`/workouts/${workoutId}/sets/${setId}`).send({ weightKg: 110, reps: 8 })

    const notifications = await personalBestNotifications()
    expect(notifications).toHaveLength(1)
    expect(notifications[0]!.payload).toEqual({ exerciseId, previousBestKg: 90 })
  })

  it('他人の記録のセットは編集できない(404)', async () => {
    const workout = await createPastWorkout('2026-09-01', [90])
    const set = await prisma.workoutSet.findFirstOrThrow({ where: { workoutId: workout.id } })
    const mateAgent = await login(mateEmail)

    const res = await mateAgent
      .patch(`/workouts/${workout.id}/sets/${set.id}`)
      .send({ weightKg: 200, reps: 8 })

    expect(res.status).toBe(404)
    expect(await prisma.notification.count({ where: { type: 'personal_best' } })).toBe(0)
  })
})

describe('personal_best通知の表示', () => {
  async function achievePersonalBest() {
    await createPastWorkout('2026-09-01', [90])
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent)
    const setId = (await addSet(agent, workoutId, 100)).body.id as string
    return { agent, workoutId, setId }
  }

  it('作成から5分未満は一覧・未読件数に出ず、一括既読でも既読にならない', async () => {
    await achievePersonalBest()
    await shiftNotificationsToPast(4)
    const mateAgent = await login(mateEmail)

    const listRes = await mateAgent.get('/notifications')
    const countRes = await mateAgent.get('/notifications/unread-count')
    await mateAgent.post('/notifications/read')

    expect(listRes.body).toHaveLength(0)
    expect(countRes.body).toEqual({ count: 0 })
    const [notification] = await personalBestNotifications()
    expect(notification!.isRead).toBe(false)
  })

  it('作成から5分経つと、取得時点の最大重量で表示する', async () => {
    const { agent, workoutId } = await achievePersonalBest()
    // 通知作成後にさらに重量を上げた場合、表示する重量は最新の値になる
    await addSet(agent, workoutId, 107.5)
    await shiftNotificationsToPast(5)
    const mateAgent = await login(mateEmail)

    const listRes = await mateAgent.get('/notifications')
    const countRes = await mateAgent.get('/notifications/unread-count')

    expect(listRes.body).toHaveLength(1)
    expect(listRes.body[0]).toEqual({
      id: expect.any(String),
      type: 'personal_best',
      isRead: false,
      createdAt: expect.any(String),
      actor: { id: lifterId, displayName: '自己ベストテスト本人' },
      target: {
        type: 'personal_best',
        workoutId,
        groupId: expect.any(String),
        performedAt: '2026-09-20',
        exerciseId,
        exerciseName: '自己ベストテスト種目',
        weightKg: 107.5,
      },
    })
    expect([groupId, secondGroupId]).toContain(listRes.body[0].target.groupId)
    expect(countRes.body).toEqual({ count: 1 })
  })

  it('重量を戻して自己ベストでなくなった場合は表示しない', async () => {
    const { agent, workoutId, setId } = await achievePersonalBest()
    await agent.patch(`/workouts/${workoutId}/sets/${setId}`).send({ weightKg: 90, reps: 8 })
    await shiftNotificationsToPast(10)
    const mateAgent = await login(mateEmail)

    const listRes = await mateAgent.get('/notifications')
    const countRes = await mateAgent.get('/notifications/unread-count')

    expect(listRes.body).toHaveLength(0)
    expect(countRes.body).toEqual({ count: 0 })
  })

  it('記録が削除された場合は表示しない', async () => {
    const { workoutId } = await achievePersonalBest()
    await prisma.workout.update({ where: { id: workoutId }, data: { deletedAt: new Date() } })
    await shiftNotificationsToPast(10)

    const res = await login(mateEmail).then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(0)
  })

  it('後日さらに自己ベストを更新しても、過去の通知は表示され続ける', async () => {
    const { agent } = await achievePersonalBest()
    const laterWorkoutId = await startWorkout(agent, '2026-09-22')
    await addSet(agent, laterWorkoutId, 110)
    await shiftNotificationsToPast(10)

    const res = await login(mateEmail).then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(2)
    expect(res.body.map((n: { target: { weightKg: number } }) => n.target.weightKg).sort()).toEqual(
      [100, 110],
    )
  })

  it('本人が全ての共通グループを退会した場合は表示しない', async () => {
    await achievePersonalBest()
    await shiftNotificationsToPast(10)
    await prisma.groupMember.updateMany({
      where: { userId: lifterId, groupId: { in: [groupId, secondGroupId] } },
      data: { leftAt: new Date() },
    })

    const res = await login(mateEmail).then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(0)
  })

  it('共通のグループが1つでも残っていれば表示し、遷移先はそのグループ', async () => {
    await achievePersonalBest()
    await shiftNotificationsToPast(10)
    await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: mateId } },
      data: { leftAt: new Date() },
    })

    const res = await login(mateEmail).then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(1)
    expect(res.body[0].target.groupId).toBe(secondGroupId)
  })

  it('グループのメンバー以外には、通知の行があっても表示しない', async () => {
    const { workoutId } = await achievePersonalBest()
    await prisma.notification.create({
      data: {
        recipientId: outsiderId,
        actorId: lifterId,
        type: 'personal_best',
        targetType: 'workout',
        targetId: workoutId,
        payload: { exerciseId, previousBestKg: 90 },
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    })
    const outsiderAgent = await login(outsiderEmail)

    const listRes = await outsiderAgent.get('/notifications')
    const countRes = await outsiderAgent.get('/notifications/unread-count')

    expect(listRes.body).toHaveLength(0)
    expect(countRes.body).toEqual({ count: 0 })
  })
})
