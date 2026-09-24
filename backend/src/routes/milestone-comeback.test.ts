import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'
import { shiftDateString, todayInJst } from '../lib/date.js'

// C1 通算の節目・C2 久しぶりの復帰(Issue #255)。本人への保存APIの応答(achievements)と、
// 仲間へのmilestone/comeback通知のテスト。docs/backlog.md「通知の種類の拡張」参照

const lifterEmail = 'milestone-lifter-test@example.com'
const mateEmail = 'milestone-mate-test@example.com'
const outsiderEmail = 'milestone-outsider-test@example.com'
const testPassword = 'password123'

let lifterId: string
let mateId: string
let outsiderId: string
let exerciseId: string
let groupId: string

const today = todayInJst()
const yesterday = shiftDateString(today, -1)

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const lifter = await prisma.user.create({
    data: { email: lifterEmail, passwordHash, displayName: '節目テスト本人' },
  })
  const mate = await prisma.user.create({
    data: { email: mateEmail, passwordHash, displayName: '節目テスト仲間' },
  })
  const outsider = await prisma.user.create({
    data: { email: outsiderEmail, passwordHash, displayName: '節目テスト部外者' },
  })
  lifterId = lifter.id
  mateId = mate.id
  outsiderId = outsider.id

  const exercise = await prisma.exercise.create({
    data: { name: '節目テスト種目', muscleGroup: 'chest' },
  })
  exerciseId = exercise.id

  const group = await prisma.group.create({
    data: { name: '節目テストグループ', createdBy: lifterId, inviteCode: `ms-${Math.random()}` },
  })
  groupId = group.id
  await prisma.groupMember.createMany({
    data: [
      { groupId, userId: lifterId, role: 'owner' },
      { groupId, userId: mateId, role: 'member' },
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

// 過去の「セットがある日」をDBに直接作る(APIを通さないため通知・判定は作られない)
async function createPastDayWithSet(performedAt: string) {
  const workout = await prisma.workout.create({
    data: { userId: lifterId, performedAt: new Date(`${performedAt}T00:00:00Z`) },
  })
  await prisma.workoutSet.create({
    data: { workoutId: workout.id, exerciseId, setOrder: 1, weightKg: 50, reps: 8 },
  })
  return workout
}

async function startWorkout(agent: Awaited<ReturnType<typeof login>>, performedAt: string) {
  const res = await agent.post('/workouts').send({ performedAt })
  return res.body.id as string
}

async function addSet(agent: Awaited<ReturnType<typeof login>>, workoutId: string) {
  return agent.post(`/workouts/${workoutId}/sets`).send({ exerciseId, reps: 8, weightKg: 50 })
}

async function shiftNotificationsToPast(type: 'milestone' | 'comeback', minutes: number) {
  await prisma.notification.updateMany({
    where: { type, actorId: lifterId },
    data: { createdAt: new Date(Date.now() - minutes * 60 * 1000) },
  })
}

function notificationsOf(type: 'milestone' | 'comeback') {
  return prisma.notification.findMany({ where: { type, actorId: lifterId } })
}

describe('C1 通算の節目', () => {
  it('9日→10日目に到達すると応答にmilestoneDaysを返し、仲間に通知する', async () => {
    for (let i = 1; i <= 9; i++) {
      await createPastDayWithSet(`2026-01-${String(i).padStart(2, '0')}`)
    }
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, '2026-01-10')

    const res = await addSet(agent, workoutId)

    expect(res.body.achievements).toEqual({ milestoneDays: 10, comeback: false })
    const notifications = await notificationsOf('milestone')
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      recipientId: mateId,
      targetType: 'workout',
      targetId: workoutId,
      payload: { days: 10 },
    })
  })

  it('節目でない日数(9日目)ではnullを返し、通知しない', async () => {
    for (let i = 1; i <= 8; i++) {
      await createPastDayWithSet(`2026-01-${String(i).padStart(2, '0')}`)
    }
    const agent = await login(lifterEmail)
    const nineth = await addSet(agent, await startWorkout(agent, '2026-01-09'))

    expect(nineth.body.achievements.milestoneDays).toBeNull()
    expect(await notificationsOf('milestone')).toHaveLength(0)
  })

  it('節目でない日数(11日目)ではnullを返し、通知しない', async () => {
    for (let i = 1; i <= 10; i++) {
      await createPastDayWithSet(`2026-01-${String(i).padStart(2, '0')}`)
    }
    const agent = await login(lifterEmail)
    const eleventh = await addSet(agent, await startWorkout(agent, '2026-01-11'))

    expect(eleventh.body.achievements.milestoneDays).toBeNull()
    expect(await notificationsOf('milestone')).toHaveLength(0)
  })

  it('同じ日の2セット目以降では判定しない', async () => {
    for (let i = 1; i <= 9; i++) {
      await createPastDayWithSet(`2026-01-${String(i).padStart(2, '0')}`)
    }
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, '2026-01-10')
    await addSet(agent, workoutId)

    const second = await addSet(agent, workoutId)

    expect(second.body.achievements).toEqual({ milestoneDays: null, comeback: false })
    expect(await notificationsOf('milestone')).toHaveLength(1)
  })

  it('削除済みの記録の日付は通算日数に数えない', async () => {
    for (let i = 1; i <= 9; i++) {
      const workout = await createPastDayWithSet(`2026-01-${String(i).padStart(2, '0')}`)
      if (i === 9)
        await prisma.workout.update({ where: { id: workout.id }, data: { deletedAt: new Date() } })
    }
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, '2026-01-10')

    const res = await addSet(agent, workoutId)

    // 削除済みの9日目を除くと実質8+今回=9日のため、10日目の節目には未到達
    expect(res.body.achievements.milestoneDays).toBeNull()
  })

  it('同じ節目は2回通知しない(記録を消して別の日に入れ直しても1件のまま)', async () => {
    for (let i = 1; i <= 9; i++) {
      await createPastDayWithSet(`2026-01-${String(i).padStart(2, '0')}`)
    }
    const agent = await login(lifterEmail)
    const firstWorkoutId = await startWorkout(agent, '2026-01-10')
    await addSet(agent, firstWorkoutId)
    expect(await notificationsOf('milestone')).toHaveLength(1)

    // 10日目の記録を消す(通算9日に戻る)
    await prisma.workout.update({ where: { id: firstWorkoutId }, data: { deletedAt: new Date() } })
    // 別の日付で入れ直し、再び通算10日目に到達させる
    const secondWorkoutId = await startWorkout(agent, '2026-01-11')
    const res = await addSet(agent, secondWorkoutId)

    expect(res.body.achievements.milestoneDays).toBe(10)
    expect(await notificationsOf('milestone')).toHaveLength(1)
  })
})

describe('milestone通知の表示', () => {
  async function achieveMilestone() {
    for (let i = 1; i <= 9; i++) {
      await createPastDayWithSet(`2026-01-${String(i).padStart(2, '0')}`)
    }
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, '2026-01-10')
    await addSet(agent, workoutId)
    return { agent, workoutId }
  }

  it('作成から5分未満は一覧・未読件数に出ない', async () => {
    await achieveMilestone()
    await shiftNotificationsToPast('milestone', 4)
    const mateAgent = await login(mateEmail)

    const listRes = await mateAgent.get('/notifications')
    const countRes = await mateAgent.get('/notifications/unread-count')

    expect(listRes.body).toHaveLength(0)
    expect(countRes.body).toEqual({ count: 0 })
  })

  it('5分経つと共通グループのメンバーに表示され、遷移先の情報を含む', async () => {
    const { workoutId } = await achieveMilestone()
    await shiftNotificationsToPast('milestone', 5)
    const mateAgent = await login(mateEmail)

    const listRes = await mateAgent.get('/notifications')

    expect(listRes.body).toHaveLength(1)
    expect(listRes.body[0]).toEqual({
      id: expect.any(String),
      type: 'milestone',
      isRead: false,
      createdAt: expect.any(String),
      actor: { id: lifterId, displayName: '節目テスト本人' },
      target: { type: 'milestone', workoutId, groupId, performedAt: '2026-01-10', days: 10 },
    })
  })

  it('記録が削除されると表示しない', async () => {
    const { workoutId } = await achieveMilestone()
    await prisma.workout.update({ where: { id: workoutId }, data: { deletedAt: new Date() } })
    await shiftNotificationsToPast('milestone', 10)

    const res = await login(mateEmail).then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(0)
  })

  it('共通のアクティブなグループが無いメンバーには表示しない', async () => {
    await achieveMilestone()
    await shiftNotificationsToPast('milestone', 10)
    await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: mateId } },
      data: { leftAt: new Date() },
    })

    const res = await login(mateEmail).then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(0)
  })

  it('グループのメンバー以外には通知の行があっても表示しない', async () => {
    const { workoutId } = await achieveMilestone()
    await prisma.notification.create({
      data: {
        recipientId: outsiderId,
        actorId: lifterId,
        type: 'milestone',
        targetType: 'workout',
        targetId: workoutId,
        payload: { days: 10 },
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    })

    const res = await login(outsiderEmail).then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(0)
  })
})

describe('C2 久しぶりの復帰', () => {
  it('初めての記録は対象外', async () => {
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, today)

    const res = await addSet(agent, workoutId)

    expect(res.body.achievements).toEqual({ milestoneDays: null, comeback: false })
    expect(await notificationsOf('comeback')).toHaveLength(0)
  })

  it('前14日間にセットがある日が無ければcomebackを返し、仲間に通知する', async () => {
    await createPastDayWithSet(shiftDateString(today, -20))
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, today)

    const res = await addSet(agent, workoutId)

    expect(res.body.achievements.comeback).toBe(true)
    const notifications = await notificationsOf('comeback')
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      recipientId: mateId,
      targetType: 'workout',
      targetId: workoutId,
    })
  })

  it('前14日以内にセットがある日があれば返さない', async () => {
    await createPastDayWithSet(shiftDateString(today, -10))
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, today)

    const res = await addSet(agent, workoutId)

    expect(res.body.achievements.comeback).toBe(false)
    expect(await notificationsOf('comeback')).toHaveLength(0)
  })

  it('ちょうど14日前は範囲内(境界値)のため返さない', async () => {
    await createPastDayWithSet(shiftDateString(today, -14))
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, today)

    const res = await addSet(agent, workoutId)

    expect(res.body.achievements.comeback).toBe(false)
  })

  it('15日前は範囲外のため返す', async () => {
    await createPastDayWithSet(shiftDateString(today, -15))
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, today)

    const res = await addSet(agent, workoutId)

    expect(res.body.achievements.comeback).toBe(true)
  })

  it('昨日の記録も対象になる(日付をまたいだ後入力)', async () => {
    await createPastDayWithSet(shiftDateString(today, -20))
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, yesterday)

    const res = await addSet(agent, workoutId)

    expect(res.body.achievements.comeback).toBe(true)
  })

  it('翌日にセットがあれば返さない(今日入力後に昨日分を後入力しても二重判定しない)', async () => {
    await createPastDayWithSet(shiftDateString(today, -20))
    const agent = await login(lifterEmail)
    // 今日の分を先に記録(comebackが発生する)
    await addSet(agent, await startWorkout(agent, today))
    expect((await notificationsOf('comeback')).length).toBe(1)

    // 続けて昨日の分を後入力
    const yesterdayWorkoutId = await startWorkout(agent, yesterday)
    const res = await addSet(agent, yesterdayWorkoutId)

    expect(res.body.achievements.comeback).toBe(false)
    expect(await notificationsOf('comeback')).toHaveLength(1)
  })

  it('日本時間で今日・昨日より前の日付の後入力は対象外', async () => {
    await createPastDayWithSet(shiftDateString(today, -30))
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, shiftDateString(today, -3))

    const res = await addSet(agent, workoutId)

    expect(res.body.achievements.comeback).toBe(false)
  })
})

describe('comeback通知の表示', () => {
  async function achieveComeback() {
    await createPastDayWithSet(shiftDateString(today, -20))
    const agent = await login(lifterEmail)
    const workoutId = await startWorkout(agent, today)
    await addSet(agent, workoutId)
    return { agent, workoutId }
  }

  it('作成から5分未満は表示せず、5分経つと表示する', async () => {
    const { workoutId } = await achieveComeback()
    await shiftNotificationsToPast('comeback', 4)
    const mateAgent = await login(mateEmail)
    expect((await mateAgent.get('/notifications')).body).toHaveLength(0)

    await shiftNotificationsToPast('comeback', 5)
    const listRes = await mateAgent.get('/notifications')

    expect(listRes.body).toHaveLength(1)
    expect(listRes.body[0]).toEqual({
      id: expect.any(String),
      type: 'comeback',
      isRead: false,
      createdAt: expect.any(String),
      actor: { id: lifterId, displayName: '節目テスト本人' },
      target: { type: 'comeback', workoutId, groupId, performedAt: today },
    })
  })

  it('記録が削除されると表示しない', async () => {
    const { workoutId } = await achieveComeback()
    await prisma.workout.update({ where: { id: workoutId }, data: { deletedAt: new Date() } })
    await shiftNotificationsToPast('comeback', 10)

    const res = await login(mateEmail).then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(0)
  })
})
