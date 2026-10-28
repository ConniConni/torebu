import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const adminEmail = 'admin-stats-admin-test@example.com'
const memberEmail = 'admin-stats-member-test@example.com'
const testPassword = 'password123'
const DAY_MS = 24 * 60 * 60 * 1000

let adminId: string
let memberId: string
const originalAdminUserIds = process.env.ADMIN_USER_IDS

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const admin = await prisma.user.create({
    data: { email: adminEmail, passwordHash, displayName: '管理者テスト', signupRef: 'share' },
  })
  // 登録から10日経っているユーザー(直近7日の登録数には入らず、30日には入る)
  const member = await prisma.user.create({
    data: {
      email: memberEmail,
      passwordHash,
      displayName: '一般テスト',
      createdAt: new Date(Date.now() - 10 * DAY_MS),
    },
  })
  adminId = admin.id
  memberId = member.id
  process.env.ADMIN_USER_IDS = `other-admin-id, ${adminId}`
})

afterEach(async () => {
  if (originalAdminUserIds === undefined) delete process.env.ADMIN_USER_IDS
  else process.env.ADMIN_USER_IDS = originalAdminUserIds
  // reactions・comments・workoutsはユーザー削除でCascadeされる。groupsはRestrictのため先に消す
  await prisma.group.deleteMany({ where: { createdBy: { in: [adminId, memberId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [adminId, memberId] } } })
})

async function loginAs(email: string) {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email, password: testPassword })
  return agent
}

describe('GET /admin/stats の認可', () => {
  it('未ログインなら404', async () => {
    const res = await request(app).get('/admin/stats')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not_found' })
  })

  it('管理者以外のログインユーザーは404', async () => {
    const agent = await loginAs(memberEmail)
    const res = await agent.get('/admin/stats')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not_found' })
  })

  it('ADMIN_USER_IDSが未設定なら、誰でも404', async () => {
    delete process.env.ADMIN_USER_IDS
    const agent = await loginAs(adminEmail)
    const res = await agent.get('/admin/stats')
    expect(res.status).toBe(404)
  })

  it('ADMIN_USER_IDSが空文字なら、誰でも404', async () => {
    process.env.ADMIN_USER_IDS = ' , '
    const agent = await loginAs(adminEmail)
    const res = await agent.get('/admin/stats')
    expect(res.status).toBe(404)
  })

  it('ADMIN_USER_IDSに載っているユーザーは200(前後の空白は無視する)', async () => {
    const agent = await loginAs(adminEmail)
    const res = await agent.get('/admin/stats')
    expect(res.status).toBe(200)
  })
})

describe('GET /admin/stats の集計値', () => {
  // テストDBは他のテストのデータと共有のため、合計値そのものではなく、
  // データを追加する前後の差分で確認する
  it('ソフトデリート済み・期間外のデータを除いて数える', async () => {
    const agent = await loginAs(adminEmail)
    const before = (await agent.get('/admin/stats')).body

    const tenDaysAgo = new Date(Date.now() - 10 * DAY_MS)
    const adminWorkout = await prisma.workout.create({
      data: { userId: adminId, performedAt: new Date('2026-10-01') },
    })
    await prisma.workout.create({ data: { userId: adminId, performedAt: new Date('2026-10-02') } })
    // 10日前に作った記録(直近30日の記録ユーザーには入り、7日には入らない)
    await prisma.workout.create({
      data: { userId: memberId, performedAt: new Date('2026-10-03'), createdAt: tenDaysAgo },
    })
    // ソフトデリート済みの記録(どの集計にも入らない。memberを直近7日の記録ユーザーにしない)
    await prisma.workout.create({
      data: { userId: memberId, performedAt: new Date('2026-10-04'), deletedAt: new Date() },
    })
    await prisma.group.create({
      data: { name: '集計テスト', createdBy: adminId, inviteCode: `invite-${Math.random()}` },
    })
    await prisma.group.create({
      data: {
        name: '集計テスト(削除済み)',
        createdBy: adminId,
        inviteCode: `invite-${Math.random()}`,
        deletedAt: new Date(),
      },
    })
    await prisma.reaction.create({
      data: { targetType: 'workout', targetId: adminWorkout.id, userId: memberId },
    })
    await prisma.comment.create({
      data: { targetType: 'workout', targetId: adminWorkout.id, userId: memberId, body: 'ナイス' },
    })
    await prisma.comment.create({
      data: {
        targetType: 'workout',
        targetId: adminWorkout.id,
        userId: memberId,
        body: '前のコメント',
        createdAt: tenDaysAgo,
      },
    })

    const res = await agent.get('/admin/stats')
    expect(res.status).toBe(200)
    const after = res.body

    // ユーザー2人は前後どちらの取得時点でも存在するため、ユーザー数の差分は0
    expect(after.users.total - before.users.total).toBe(0)
    expect(after.activeUsers.last7Days - before.activeUsers.last7Days).toBe(1)
    expect(after.activeUsers.last30Days - before.activeUsers.last30Days).toBe(2)
    expect(after.groups.total - before.groups.total).toBe(1)
    expect(after.workouts.total - before.workouts.total).toBe(3)
    expect(after.workouts.last7Days - before.workouts.last7Days).toBe(2)
    expect(after.reactions.total - before.reactions.total).toBe(1)
    expect(after.reactions.last7Days - before.reactions.last7Days).toBe(1)
    expect(after.comments.total - before.comments.total).toBe(2)
    expect(after.comments.last7Days - before.comments.last7Days).toBe(1)
  })

  it('登録人数は、累計・直近7日/30日・シェア経由で数える', async () => {
    const agent = await loginAs(adminEmail)
    const before = (await agent.get('/admin/stats')).body
    // 前後の差分を取るため、3人目のユーザーを後から作る(シェア経由・登録したばかり)
    const thirdEmail = 'admin-stats-third-test@example.com'
    const third = await prisma.user.create({
      data: { email: thirdEmail, passwordHash: 'x', displayName: '3人目', signupRef: 'share' },
    })
    // 40日前に登録したユーザー(累計にだけ入る)
    const oldEmail = 'admin-stats-old-test@example.com'
    const old = await prisma.user.create({
      data: {
        email: oldEmail,
        passwordHash: 'x',
        displayName: '古参',
        createdAt: new Date(Date.now() - 40 * DAY_MS),
      },
    })
    try {
      const after = (await agent.get('/admin/stats')).body
      expect(after.users.total - before.users.total).toBe(2)
      expect(after.users.last7Days - before.users.last7Days).toBe(1)
      expect(after.users.last30Days - before.users.last30Days).toBe(1)
      expect(after.users.viaShare - before.users.viaShare).toBe(1)
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [third.id, old.id] } } })
    }
  })
})
