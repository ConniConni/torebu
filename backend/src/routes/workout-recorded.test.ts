import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'
import { shiftDateString, todayInJst } from '../lib/date.js'

// 仲間の「記録した」通知(Issue #350)。発火条件・宛先(受信設定)・達成系通知との重複抑制・
// 一覧での表示(5分遅延・未読バッジに含めない)・設定APIのテスト

const actorEmail = 'recorded-actor-test@example.com'
const mateEmail = 'recorded-mate-test@example.com'
const outsiderEmail = 'recorded-outsider-test@example.com'
const testPassword = 'password123'

let actorId: string
let mateId: string
let outsiderId: string
let strengthId: string
let cardioId: string
let groupId: string

const today = todayInJst()
const yesterday = shiftDateString(today, -1)

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const actor = await prisma.user.create({
    data: { email: actorEmail, passwordHash, displayName: '記録テスト本人' },
  })
  const mate = await prisma.user.create({
    data: { email: mateEmail, passwordHash, displayName: '記録テスト仲間' },
  })
  const outsider = await prisma.user.create({
    data: { email: outsiderEmail, passwordHash, displayName: '記録テスト部外者' },
  })
  actorId = actor.id
  mateId = mate.id
  outsiderId = outsider.id

  strengthId = (
    await prisma.exercise.create({ data: { name: '記録テスト筋トレ', muscleGroup: 'chest' } })
  ).id
  cardioId = (
    await prisma.exercise.create({
      data: { name: '記録テストラン', muscleGroup: 'cardio', speedUnit: 'pace' },
    })
  ).id

  const group = await prisma.group.create({
    data: { name: '記録テストグループ', createdBy: actorId, inviteCode: `rec-${Math.random()}` },
  })
  groupId = group.id
  await prisma.groupMember.createMany({
    data: [
      { groupId, userId: actorId, role: 'owner' },
      { groupId, userId: mateId, role: 'member' },
    ],
  })

  // 節目・復帰に当たらないよう、直近に記録のある日を作っておく(通算2日目以降・14日以内に記録あり)
  const base = await prisma.workout.create({
    data: { userId: actorId, performedAt: new Date(`${shiftDateString(today, -5)}T00:00:00Z`) },
  })
  await prisma.workoutSet.create({
    data: { workoutId: base.id, exerciseId: strengthId, setOrder: 1, weightKg: 50, reps: 8 },
  })
})

afterEach(async () => {
  const userIds = [actorId, mateId, outsiderId]
  await prisma.notification.deleteMany({ where: { recipientId: { in: userIds } } })
  await prisma.groupMember.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.group.deleteMany({ where: { createdBy: actorId } })
  await prisma.workoutSet.deleteMany({ where: { workout: { userId: { in: userIds } } } })
  await prisma.workoutExercise.deleteMany({ where: { workout: { userId: { in: userIds } } } })
  await prisma.workout.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.exercise.deleteMany({ where: { id: { in: [strengthId, cardioId] } } })
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

function addStrengthSet(agent: Agent, workoutId: string) {
  return agent
    .post(`/workouts/${workoutId}/sets`)
    .send({ exerciseId: strengthId, reps: 8, weightKg: 40 })
}

function addCardioSet(agent: Agent, workoutId: string) {
  return agent
    .post(`/workouts/${workoutId}/sets`)
    .send({ exerciseId: cardioId, distanceKm: 5, durationSec: 1800 })
}

function recordedNotifications() {
  return prisma.notification.findMany({ where: { type: 'workout_recorded', actorId } })
}

describe('「記録した」通知の作成', () => {
  it('筋トレの最初のセットで、同じグループの仲間に通知する(本人には作らない)', async () => {
    const agent = await login(actorEmail)
    const workoutId = await startWorkout(agent)

    const res = await addStrengthSet(agent, workoutId)

    expect(res.status).toBe(201)
    const notifications = await recordedNotifications()
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      recipientId: mateId,
      targetType: 'workout',
      targetId: workoutId,
    })
  })

  it('有酸素の最初のセットでも通知する', async () => {
    const agent = await login(actorEmail)
    const workoutId = await startWorkout(agent)

    await addCardioSet(agent, workoutId)

    expect(await recordedNotifications()).toHaveLength(1)
  })

  it('同じ日の2セット目以降では作らない', async () => {
    const agent = await login(actorEmail)
    const workoutId = await startWorkout(agent)
    await addStrengthSet(agent, workoutId)
    await addStrengthSet(agent, workoutId)
    await addCardioSet(agent, workoutId)

    expect(await recordedNotifications()).toHaveLength(1)
  })

  it('グループに所属していなければ誰にも通知しない', async () => {
    await prisma.groupMember.deleteMany({ where: { userId: mateId } })
    const agent = await login(actorEmail)
    await addStrengthSet(agent, await startWorkout(agent))

    expect(await recordedNotifications()).toHaveLength(0)
  })

  it('グループ外のユーザーには通知しない', async () => {
    const agent = await login(actorEmail)
    await addStrengthSet(agent, await startWorkout(agent))

    const notifications = await recordedNotifications()
    expect(notifications.map((n) => n.recipientId)).not.toContain(outsiderId)
  })

  it('受信設定をオフにしている仲間には作らない', async () => {
    await prisma.user.update({ where: { id: mateId }, data: { notifyWorkoutRecorded: false } })
    const agent = await login(actorEmail)
    await addStrengthSet(agent, await startWorkout(agent))

    expect(await recordedNotifications()).toHaveLength(0)
  })

  it('セットを全部消して入れ直しても、同じ記録について重複して作らない', async () => {
    const agent = await login(actorEmail)
    const workoutId = await startWorkout(agent)
    const first = await addStrengthSet(agent, workoutId)
    await agent.delete(`/workouts/${workoutId}/sets/${first.body.id}`)

    await addStrengthSet(agent, workoutId)

    expect(await recordedNotifications()).toHaveLength(1)
  })
})

describe('達成系の通知との重複抑制', () => {
  it('久しぶりの復帰(comeback)が作られたときは作らない', async () => {
    // 直近14日の記録を消して、今日が久しぶりの記録になるようにする
    await prisma.workoutSet.deleteMany({ where: { workout: { userId: actorId } } })
    await prisma.workout.deleteMany({ where: { userId: actorId } })
    const old = await prisma.workout.create({
      data: { userId: actorId, performedAt: new Date('2026-01-01T00:00:00Z') },
    })
    await prisma.workoutSet.create({
      data: { workoutId: old.id, exerciseId: strengthId, setOrder: 1, weightKg: 50, reps: 8 },
    })
    const agent = await login(actorEmail)

    await addStrengthSet(agent, await startWorkout(agent, yesterday))

    expect(await prisma.notification.count({ where: { type: 'comeback', actorId } })).toBe(1)
    expect(await recordedNotifications()).toHaveLength(0)
  })

  it('通算の節目(milestone)が作られたときは作らない', async () => {
    // beforeEachの1日 + 8日 = 9日。今日の記録で10日目になる
    for (let i = 1; i <= 8; i++) {
      const w = await prisma.workout.create({
        data: {
          userId: actorId,
          performedAt: new Date(`${shiftDateString(today, -5 - i)}T00:00:00Z`),
        },
      })
      await prisma.workoutSet.create({
        data: { workoutId: w.id, exerciseId: strengthId, setOrder: 1, weightKg: 50, reps: 8 },
      })
    }
    const agent = await login(actorEmail)

    await addStrengthSet(agent, await startWorkout(agent))

    expect(await prisma.notification.count({ where: { type: 'milestone', actorId } })).toBe(1)
    expect(await recordedNotifications()).toHaveLength(0)
  })

  it('節目が通知済みで作られなかった場合は、作る', async () => {
    for (let i = 1; i <= 8; i++) {
      const w = await prisma.workout.create({
        data: {
          userId: actorId,
          performedAt: new Date(`${shiftDateString(today, -5 - i)}T00:00:00Z`),
        },
      })
      await prisma.workoutSet.create({
        data: { workoutId: w.id, exerciseId: strengthId, setOrder: 1, weightKg: 50, reps: 8 },
      })
    }
    // 10日目の節目は別の記録で通知済み(日付を直して入れ直した状況)
    await prisma.notification.create({
      data: {
        recipientId: mateId,
        actorId,
        type: 'milestone',
        targetType: 'workout',
        targetId: (await prisma.workout.findFirstOrThrow({ where: { userId: actorId } })).id,
        payload: { days: 10 },
      },
    })
    const agent = await login(actorEmail)

    await addStrengthSet(agent, await startWorkout(agent))

    expect(await recordedNotifications()).toHaveLength(1)
  })

  it('最初のセットが自己ベスト更新のときは作らない', async () => {
    const agent = await login(actorEmail)
    // beforeEachの記録は50kg。今日は同じ種目で60kgを最初のセットにする
    const workoutId = await startWorkout(agent)
    await agent
      .post(`/workouts/${workoutId}/sets`)
      .send({ exerciseId: strengthId, reps: 8, weightKg: 60 })

    expect(await prisma.notification.count({ where: { type: 'personal_best', actorId } })).toBe(1)
    expect(await recordedNotifications()).toHaveLength(0)
  })
})

describe('通知一覧・未読バッジ', () => {
  async function makeRecordedVisible() {
    await prisma.notification.updateMany({
      where: { type: 'workout_recorded', actorId },
      data: { createdAt: new Date(Date.now() - 6 * 60 * 1000) },
    })
  }

  it('作成から5分未満は一覧に出さない', async () => {
    const actor = await login(actorEmail)
    await addStrengthSet(actor, await startWorkout(actor))
    const mate = await login(mateEmail)

    const res = await mate.get('/notifications')

    expect(res.body).toEqual([])
  })

  it('5分経つと、種目名つきで一覧に出す。未読バッジの件数には含めない', async () => {
    const actor = await login(actorEmail)
    const workoutId = await startWorkout(actor)
    await addStrengthSet(actor, workoutId)
    await addCardioSet(actor, workoutId)
    await makeRecordedVisible()
    const mate = await login(mateEmail)

    const list = await mate.get('/notifications')
    const count = await mate.get('/notifications/unread-count')

    expect(list.body).toHaveLength(1)
    expect(list.body[0]).toMatchObject({
      type: 'workout_recorded',
      isRead: false,
      actor: { id: actorId },
      target: {
        type: 'workout_recorded',
        workoutId,
        groupId,
        exerciseName: '記録テスト筋トレ',
        exerciseCount: 2,
      },
    })
    expect(count.body.count).toBe(0)
  })

  it('一覧を開いて一括既読にすると、記録通知も既読になる', async () => {
    const actor = await login(actorEmail)
    await addStrengthSet(actor, await startWorkout(actor))
    await makeRecordedVisible()
    const mate = await login(mateEmail)

    await mate.post('/notifications/read')

    // 他ユーザー宛(ローカルDBに残った通知など)を拾わないよう、受信者で絞る
    const rows = await prisma.notification.findMany({
      where: { type: 'workout_recorded', recipientId: mateId },
    })
    expect(rows).toHaveLength(1)
    expect(rows.every((n) => n.isRead)).toBe(true)
  })

  it('記録のセットが全部消えた通知は表示しない', async () => {
    const actor = await login(actorEmail)
    const workoutId = await startWorkout(actor)
    const set = await addStrengthSet(actor, workoutId)
    await makeRecordedVisible()
    await actor.delete(`/workouts/${workoutId}/sets/${set.body.id}`)
    const mate = await login(mateEmail)

    const res = await mate.get('/notifications')

    expect(res.body).toEqual([])
  })

  it('記録通知が多くても、いいね・コメントの通知は押し出されない', async () => {
    const actor = await login(actorEmail)
    const workoutId = await startWorkout(actor)
    await addStrengthSet(actor, workoutId)
    await prisma.notification.createMany({
      data: Array.from({ length: 40 }, () => ({
        recipientId: mateId,
        actorId,
        type: 'workout_recorded' as const,
        targetType: 'workout' as const,
        targetId: workoutId,
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      })),
    })
    // 古いいいね通知(記録通知40件より古い)
    await prisma.notification.create({
      data: {
        recipientId: mateId,
        actorId,
        type: 'reaction',
        targetType: 'workout',
        targetId: workoutId,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    })
    const mate = await login(mateEmail)

    const res = await mate.get('/notifications')

    expect(res.body.some((n: { type: string }) => n.type === 'reaction')).toBe(true)
  })
})

describe('PATCH /auth/me/settings', () => {
  it('notifyWorkoutRecordedを切り替えられ、/auth/meにも反映される', async () => {
    const agent = await login(mateEmail)

    const off = await agent.patch('/auth/me/settings').send({ notifyWorkoutRecorded: false })
    const me = await agent.get('/auth/me')
    const on = await agent.patch('/auth/me/settings').send({ notifyWorkoutRecorded: true })

    expect(off.status).toBe(200)
    expect(off.body).toEqual({ notifyWorkoutRecorded: false, showAllOneRm: false })
    expect(me.body.notifyWorkoutRecorded).toBe(false)
    expect(on.body).toEqual({ notifyWorkoutRecorded: true, showAllOneRm: false })
  })

  it('showAllOneRmを切り替えられ、/auth/meにも反映される。通知の設定は変わらない(Issue #362)', async () => {
    const agent = await login(mateEmail)

    const on = await agent.patch('/auth/me/settings').send({ showAllOneRm: true })
    const me = await agent.get('/auth/me')
    const off = await agent.patch('/auth/me/settings').send({ showAllOneRm: false })

    expect(on.status).toBe(200)
    expect(on.body).toEqual({ notifyWorkoutRecorded: true, showAllOneRm: true })
    expect(me.body.showAllOneRm).toBe(true)
    expect(me.body.notifyWorkoutRecorded).toBe(true)
    expect(off.body.showAllOneRm).toBe(false)
  })

  it('空のボディ・真偽値以外は400', async () => {
    const agent = await login(mateEmail)

    expect((await agent.patch('/auth/me/settings').send({})).status).toBe(400)
    expect(
      (await agent.patch('/auth/me/settings').send({ notifyWorkoutRecorded: 'no' })).status,
    ).toBe(400)
    expect((await agent.patch('/auth/me/settings').send({ showAllOneRm: 'no' })).status).toBe(400)
  })

  it('未ログインは401', async () => {
    const res = await request(app).patch('/auth/me/settings').send({ notifyWorkoutRecorded: false })

    expect(res.status).toBe(401)
  })
})
