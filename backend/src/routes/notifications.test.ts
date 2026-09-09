import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const ownerEmail = 'notifications-owner-test@example.com'
const actorEmail = 'notifications-actor-test@example.com'
const testPassword = 'password123'

let ownerId: string
let actorId: string
let exerciseId: string
let groupId: string

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const owner = await prisma.user.create({
    data: { email: ownerEmail, passwordHash, displayName: '通知テストユーザー' },
  })
  const actor = await prisma.user.create({
    data: { email: actorEmail, passwordHash, displayName: '通知テスト相手' },
  })
  ownerId = owner.id
  actorId = actor.id

  const exercise = await prisma.exercise.create({
    data: { name: 'ベンチプレス', muscleGroup: 'chest' },
  })
  exerciseId = exercise.id

  // いいね・コメントの対象範囲は「同じグループに所属しているか」で決まるため(docs/schema.md参照)、
  // ownerとactorを同じグループに所属させておく
  const group = await prisma.group.create({
    data: { name: '通知テストグループ', createdBy: ownerId, inviteCode: `invite-${Math.random()}` },
  })
  groupId = group.id
  await prisma.groupMember.create({ data: { groupId: group.id, userId: ownerId, role: 'owner' } })
  await prisma.groupMember.create({ data: { groupId: group.id, userId: actorId, role: 'member' } })
})

afterEach(async () => {
  await prisma.notification.deleteMany({ where: { recipientId: { in: [ownerId, actorId] } } })
  await prisma.reaction.deleteMany({ where: { userId: { in: [ownerId, actorId] } } })
  await prisma.groupMember.deleteMany({ where: { userId: { in: [ownerId, actorId] } } })
  await prisma.group.deleteMany({ where: { createdBy: ownerId } })
  await prisma.workoutSet.deleteMany({ where: { workout: { userId: { in: [ownerId, actorId] } } } })
  await prisma.workout.deleteMany({ where: { userId: { in: [ownerId, actorId] } } })
  await prisma.exercise.deleteMany({ where: { id: exerciseId } })
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, actorId] } } })
})

async function loginAsOwner() {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email: ownerEmail, password: testPassword })
  return agent
}

async function loginAsActor() {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email: actorEmail, password: testPassword })
  return agent
}

async function createWorkoutWithSet(userId: string) {
  const workout = await prisma.workout.create({
    data: { userId, performedAt: new Date('2026-09-01') },
  })
  await prisma.workoutSet.create({
    data: { workoutId: workout.id, exerciseId, setOrder: 1, weightKg: 60, reps: 8 },
  })
  return workout
}

// いいね・コメントAPI(workouts.ts)経由で通知を作る(通知はアプリの内部イベントとしてのみ発行され、
// 直接作成するAPIは無いため)
async function reactAsActor(workoutId: string) {
  const agent = await loginAsActor()
  await agent.post(`/workouts/${workoutId}/reactions`)
}

describe('GET /notifications', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).get('/notifications')
    expect(res.status).toBe(401)
  })

  it('自分宛の通知のみ、新しい順に返す', async () => {
    const workout = await createWorkoutWithSet(ownerId)
    await reactAsActor(workout.id)
    const actorAgent = await loginAsActor()
    await actorAgent.post(`/workouts/${workout.id}/comments`).send({ body: 'いいですね' })

    const res = await loginAsOwner().then((agent) => agent.get('/notifications'))

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toMatchObject({
      type: 'comment',
      isRead: false,
      actor: { id: actorId, displayName: '通知テスト相手' },
      target: {
        type: 'workout',
        workoutId: workout.id,
        groupId,
        exerciseName: 'ベンチプレス',
        exerciseCount: 1,
      },
    })
    expect(res.body[1]).toMatchObject({ type: 'reaction' })
  })

  it('actorが既に共通のグループを退会している場合、groupIdはnullになる', async () => {
    const workout = await createWorkoutWithSet(ownerId)
    await reactAsActor(workout.id)
    await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: actorId } },
      data: { leftAt: new Date() },
    })

    const res = await loginAsOwner().then((agent) => agent.get('/notifications'))

    expect(res.status).toBe(200)
    expect(res.body[0].target.groupId).toBeNull()
  })

  it('他人宛の通知は返らない', async () => {
    const workout = await createWorkoutWithSet(ownerId)
    await reactAsActor(workout.id)

    const res = await loginAsActor().then((agent) => agent.get('/notifications'))

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })

  it('対象の記録が削除済みの通知は一覧から除外される', async () => {
    const workout = await createWorkoutWithSet(ownerId)
    await reactAsActor(workout.id)
    await prisma.workout.update({ where: { id: workout.id }, data: { deletedAt: new Date() } })

    const res = await loginAsOwner().then((agent) => agent.get('/notifications'))

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})

describe('GET /notifications/unread-count', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).get('/notifications/unread-count')
    expect(res.status).toBe(401)
  })

  it('未読件数を返す', async () => {
    const workout = await createWorkoutWithSet(ownerId)
    await reactAsActor(workout.id)

    const res = await loginAsOwner().then((agent) => agent.get('/notifications/unread-count'))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ count: 1 })
  })

  it('他人の未読は数えない', async () => {
    const workout = await createWorkoutWithSet(ownerId)
    await reactAsActor(workout.id)

    const res = await loginAsActor().then((agent) => agent.get('/notifications/unread-count'))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ count: 0 })
  })
})

describe('POST /notifications/read', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).post('/notifications/read')
    expect(res.status).toBe(401)
  })

  it('自分宛の未読通知が既読になる', async () => {
    const workout = await createWorkoutWithSet(ownerId)
    await reactAsActor(workout.id)
    const ownerAgent = await loginAsOwner()

    const res = await ownerAgent.post('/notifications/read')
    expect(res.status).toBe(204)

    const unreadCount = await prisma.notification.count({
      where: { recipientId: ownerId, isRead: false },
    })
    expect(unreadCount).toBe(0)
    const listRes = await ownerAgent.get('/notifications')
    expect(listRes.body[0].isRead).toBe(true)
  })

  it('他人の通知には影響しない', async () => {
    const workout = await createWorkoutWithSet(ownerId)
    await reactAsActor(workout.id)

    const actorAgent = await loginAsActor()
    await actorAgent.post('/notifications/read')

    const unreadCount = await prisma.notification.count({
      where: { recipientId: ownerId, isRead: false },
    })
    expect(unreadCount).toBe(1)
  })
})
