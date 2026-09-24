import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const ownerEmail = 'notifications-owner-test@example.com'
const actorEmail = 'notifications-actor-test@example.com'
const joinerEmail = 'notifications-joiner-test@example.com'
const testPassword = 'password123'

let ownerId: string
let actorId: string
let joinerId: string
let exerciseId: string
let groupId: string
let inviteCode: string

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const owner = await prisma.user.create({
    data: { email: ownerEmail, passwordHash, displayName: '通知テストユーザー' },
  })
  const actor = await prisma.user.create({
    data: { email: actorEmail, passwordHash, displayName: '通知テスト相手' },
  })
  // member_joined通知(Issue #249)のテスト用。最初はどのグループにも所属していない
  const joiner = await prisma.user.create({
    data: { email: joinerEmail, passwordHash, displayName: '通知テスト参加者' },
  })
  ownerId = owner.id
  actorId = actor.id
  joinerId = joiner.id

  const exercise = await prisma.exercise.create({
    data: { name: 'ベンチプレス', muscleGroup: 'chest' },
  })
  exerciseId = exercise.id

  // いいね・コメントの対象範囲は「同じグループに所属しているか」で決まるため(docs/schema.md参照)、
  // ownerとactorを同じグループに所属させておく
  inviteCode = `invite-${Math.random()}`
  const group = await prisma.group.create({
    data: { name: '通知テストグループ', createdBy: ownerId, inviteCode },
  })
  groupId = group.id
  await prisma.groupMember.create({ data: { groupId: group.id, userId: ownerId, role: 'owner' } })
  await prisma.groupMember.create({ data: { groupId: group.id, userId: actorId, role: 'member' } })
})

afterEach(async () => {
  const userIds = [ownerId, actorId, joinerId]
  await prisma.notification.deleteMany({ where: { recipientId: { in: userIds } } })
  await prisma.reaction.deleteMany({ where: { userId: { in: [ownerId, actorId] } } })
  await prisma.groupMember.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.group.deleteMany({ where: { createdBy: ownerId } })
  await prisma.workoutSet.deleteMany({ where: { workout: { userId: { in: [ownerId, actorId] } } } })
  await prisma.workout.deleteMany({ where: { userId: { in: [ownerId, actorId] } } })
  await prisma.exercise.deleteMany({ where: { id: exerciseId } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
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

async function loginAsJoiner() {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email: joinerEmail, password: testPassword })
  return agent
}

// joinerが招待コードでグループに参加する(POST /groups/join経由でmember_joined通知を作る)。
// 通知の表示は作成から5分後のため、minutesAgoを指定すると作成日時を過去にずらす
async function joinAsJoiner(options: { minutesAgo?: number } = {}) {
  const agent = await loginAsJoiner()
  await agent.post('/groups/join').send({ inviteCode })
  if (options.minutesAgo !== undefined) {
    await prisma.notification.updateMany({
      where: { type: 'member_joined', actorId: joinerId },
      data: { createdAt: new Date(Date.now() - options.minutesAgo * 60 * 1000) },
    })
  }
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

// 新メンバー参加の通知(Issue #249)。作成から5分経つまで表示せず、表示時に条件を確認し直す
describe('member_joined通知の表示', () => {
  it('作成から5分未満の通知は、一覧・未読件数に出ない', async () => {
    await joinAsJoiner({ minutesAgo: 4 })
    const ownerAgent = await loginAsOwner()

    const listRes = await ownerAgent.get('/notifications')
    const countRes = await ownerAgent.get('/notifications/unread-count')

    expect(listRes.body).toHaveLength(0)
    expect(countRes.body).toEqual({ count: 0 })
  })

  it('作成から5分経った通知は、グループを対象として一覧・未読件数に出る', async () => {
    await joinAsJoiner({ minutesAgo: 5 })
    const ownerAgent = await loginAsOwner()

    const listRes = await ownerAgent.get('/notifications')
    const countRes = await ownerAgent.get('/notifications/unread-count')

    expect(listRes.body).toHaveLength(1)
    expect(listRes.body[0]).toEqual({
      id: expect.any(String),
      type: 'member_joined',
      isRead: false,
      createdAt: expect.any(String),
      actor: { id: joinerId, displayName: '通知テスト参加者' },
      target: { type: 'group', groupId, groupName: '通知テストグループ' },
    })
    expect(countRes.body).toEqual({ count: 1 })
  })

  it('参加者が既に退会している場合は表示しない', async () => {
    await joinAsJoiner({ minutesAgo: 10 })
    const joinerAgent = await loginAsJoiner()
    await joinerAgent.post(`/groups/${groupId}/leave`)

    const ownerAgent = await loginAsOwner()
    const listRes = await ownerAgent.get('/notifications')
    const countRes = await ownerAgent.get('/notifications/unread-count')

    expect(listRes.body).toHaveLength(0)
    expect(countRes.body).toEqual({ count: 0 })
  })

  it('受信者が既に退会している場合は表示しない(グループのメンバー以外には表示されない)', async () => {
    await joinAsJoiner({ minutesAgo: 10 })
    await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: actorId } },
      data: { leftAt: new Date() },
    })

    const res = await loginAsActor().then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(0)
  })

  it('グループが削除されている場合は表示しない', async () => {
    await joinAsJoiner({ minutesAgo: 10 })
    await prisma.group.update({ where: { id: groupId }, data: { deletedAt: new Date() } })

    const res = await loginAsOwner().then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(0)
  })

  it('参加者本人には通知が届かない', async () => {
    await joinAsJoiner({ minutesAgo: 10 })

    const res = await loginAsJoiner().then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(0)
  })

  it('いいね・コメントの通知は5分待たずにすぐ表示される', async () => {
    const workout = await createWorkoutWithSet(ownerId)
    await reactAsActor(workout.id)

    const res = await loginAsOwner().then((agent) => agent.get('/notifications'))

    expect(res.body).toHaveLength(1)
    expect(res.body[0].type).toBe('reaction')
  })

  it('一括既読は、まだ表示していない(作成から5分未満の)通知を既読にしない', async () => {
    await joinAsJoiner({ minutesAgo: 1 })
    const workout = await createWorkoutWithSet(ownerId)
    await reactAsActor(workout.id)
    const ownerAgent = await loginAsOwner()

    await ownerAgent.post('/notifications/read')

    const memberJoined = await prisma.notification.findFirstOrThrow({
      where: { recipientId: ownerId, type: 'member_joined' },
    })
    const reaction = await prisma.notification.findFirstOrThrow({
      where: { recipientId: ownerId, type: 'reaction' },
    })
    expect(memberJoined.isRead).toBe(false)
    expect(reaction.isRead).toBe(true)

    // 5分経って表示されるようになったときに、未読として出る
    await prisma.notification.update({
      where: { id: memberJoined.id },
      data: { createdAt: new Date(Date.now() - 6 * 60 * 1000) },
    })
    const listRes = await ownerAgent.get('/notifications')
    const shown = listRes.body.find((n: { type: string }) => n.type === 'member_joined')
    expect(shown.isRead).toBe(false)
  })

  it('一括既読は、表示条件を満たさなくなった通知を既読にしない', async () => {
    await joinAsJoiner({ minutesAgo: 10 })
    await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: joinerId } },
      data: { leftAt: new Date() },
    })

    await loginAsOwner().then((agent) => agent.post('/notifications/read'))

    const memberJoined = await prisma.notification.findFirstOrThrow({
      where: { recipientId: ownerId, type: 'member_joined' },
    })
    expect(memberJoined.isRead).toBe(false)
  })
})

// 未読件数と一覧の未読の数を揃える(Issue #249)
describe('未読件数と一覧の整合', () => {
  it('削除済み記録への通知は未読件数に数えない', async () => {
    const deletedWorkout = await createWorkoutWithSet(ownerId)
    const workout = await createWorkoutWithSet(ownerId)
    await reactAsActor(deletedWorkout.id)
    await reactAsActor(workout.id)
    await prisma.workout.update({
      where: { id: deletedWorkout.id },
      data: { deletedAt: new Date() },
    })
    const ownerAgent = await loginAsOwner()

    const listRes = await ownerAgent.get('/notifications')
    const countRes = await ownerAgent.get('/notifications/unread-count')

    expect(listRes.body).toHaveLength(1)
    expect(countRes.body).toEqual({ count: 1 })
  })

  it('未読件数は一覧と同じ直近50件の範囲で数える', async () => {
    const workout = await createWorkoutWithSet(ownerId)
    // 直近50件より古い未読通知(一覧に出ない)を1件作り、その後に既読の通知を50件作る
    const base = Date.now() - 60 * 60 * 1000
    await prisma.notification.create({
      data: {
        recipientId: ownerId,
        actorId,
        type: 'reaction',
        targetType: 'workout',
        targetId: workout.id,
        createdAt: new Date(base),
      },
    })
    await prisma.notification.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        recipientId: ownerId,
        actorId,
        type: 'comment' as const,
        targetType: 'workout' as const,
        targetId: workout.id,
        isRead: true,
        createdAt: new Date(base + (i + 1) * 1000),
      })),
    })
    const ownerAgent = await loginAsOwner()

    const listRes = await ownerAgent.get('/notifications')
    const countRes = await ownerAgent.get('/notifications/unread-count')

    expect(listRes.body).toHaveLength(50)
    expect(listRes.body.filter((n: { isRead: boolean }) => !n.isRead)).toHaveLength(0)
    expect(countRes.body).toEqual({ count: 0 })
  })
})
