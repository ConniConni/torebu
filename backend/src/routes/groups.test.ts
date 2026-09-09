import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const ownerEmail = 'groups-owner-test@example.com'
const memberEmail = 'groups-member-test@example.com'
const outsiderEmail = 'groups-outsider-test@example.com'
const testPassword = 'password123'

let ownerId: string
let memberId: string
let outsiderId: string

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const owner = await prisma.user.create({
    data: { email: ownerEmail, passwordHash, displayName: 'グループテストオーナー' },
  })
  const member = await prisma.user.create({
    data: { email: memberEmail, passwordHash, displayName: 'グループテストメンバー' },
  })
  const outsider = await prisma.user.create({
    data: { email: outsiderEmail, passwordHash, displayName: 'グループテスト部外者' },
  })
  ownerId = owner.id
  memberId = member.id
  outsiderId = outsider.id
})

afterEach(async () => {
  await prisma.groupMember.deleteMany({
    where: { userId: { in: [ownerId, memberId, outsiderId] } },
  })
  await prisma.group.deleteMany({ where: { createdBy: { in: [ownerId, memberId, outsiderId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, outsiderId] } } })
})

async function loginAs(email: string) {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email, password: testPassword })
  return agent
}

async function createGroup(overrides: {
  createdBy?: string
  memberLimit?: number
  inviteCode?: string
  inviteExpiresAt?: Date | null
} = {}) {
  const createdBy = overrides.createdBy ?? ownerId
  const group = await prisma.group.create({
    data: {
      name: 'ベンチプレス部',
      createdBy,
      inviteCode: overrides.inviteCode ?? `invite-${Math.random().toString(36).slice(2)}`,
      memberLimit: overrides.memberLimit ?? 10,
      inviteExpiresAt: overrides.inviteExpiresAt,
    },
  })
  await prisma.groupMember.create({
    data: { groupId: group.id, userId: createdBy, role: 'owner' },
  })
  return group
}

async function addMember(groupId: string, userId: string, overrides: { role?: 'owner' | 'member'; leftAt?: Date | null } = {}) {
  return prisma.groupMember.create({
    data: { groupId, userId, role: overrides.role ?? 'member', leftAt: overrides.leftAt ?? null },
  })
}

describe('POST /groups', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).post('/groups').send({ name: 'ベンチプレス部' })

    expect(res.status).toBe(401)
  })

  it('nameが無ければ400を返す', async () => {
    const agent = await loginAs(ownerEmail)
    const res = await agent.post('/groups').send({})

    expect(res.status).toBe(400)
  })

  it('グループを作成し、作成者が自動的にownerとして参加する', async () => {
    const agent = await loginAs(ownerEmail)
    const res = await agent.post('/groups').send({ name: 'ベンチプレス部' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'ベンチプレス部',
      memberLimit: 10,
      inviteCode: expect.any(String),
      inviteExpiresAt: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      role: 'owner',
    })

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: res.body.id, userId: ownerId } },
    })
    expect(membership?.role).toBe('owner')
    expect(membership?.leftAt).toBeNull()
  })
})

describe('GET /groups', () => {
  it('leftAtがあるグループ(退会済み)は一覧に含めない', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId, { leftAt: new Date() })

    const agent = await loginAs(memberEmail)
    const res = await agent.get('/groups')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('自分が所属するアクティブなグループのみ、roleを含めて返す', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)
    await createGroup({ createdBy: outsiderId })

    const agent = await loginAs(memberEmail)
    const res = await agent.get('/groups')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([expect.objectContaining({ id: group.id, role: 'member' })])
  })
})

describe('GET /groups/:id', () => {
  it('未所属者には404を返す(IDOR対策)', async () => {
    const group = await createGroup()

    const agent = await loginAs(outsiderEmail)
    const res = await agent.get(`/groups/${group.id}`)

    expect(res.status).toBe(404)
  })

  it('退会済みメンバーには404を返す', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId, { leftAt: new Date() })

    const agent = await loginAs(memberEmail)
    const res = await agent.get(`/groups/${group.id}`)

    expect(res.status).toBe(404)
  })

  it('所属メンバーには詳細とアクティブなメンバー一覧を返す', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)
    const leftUserPasswordHash = await bcrypt.hash(testPassword, 12)
    const leftUser = await prisma.user.create({
      data: { email: 'groups-left-test@example.com', passwordHash: leftUserPasswordHash, displayName: '退会済みユーザー' },
    })
    await addMember(group.id, leftUser.id, { leftAt: new Date() })

    const agent = await loginAs(memberEmail)
    const res = await agent.get(`/groups/${group.id}`)

    expect(res.status).toBe(200)
    expect(res.body.role).toBe('member')
    expect(res.body.members).toEqual([
      { userId: ownerId, displayName: 'グループテストオーナー', role: 'owner', joinedAt: expect.any(String) },
      { userId: memberId, displayName: 'グループテストメンバー', role: 'member', joinedAt: expect.any(String) },
    ])

    await prisma.user.delete({ where: { id: leftUser.id } })
  })
})

describe('GET /groups/:id/workouts', () => {
  let exerciseId: string

  beforeEach(async () => {
    const exercise = await prisma.exercise.create({
      data: { name: 'ベンチプレス', muscleGroup: 'chest' },
    })
    exerciseId = exercise.id
  })

  afterEach(async () => {
    // reactionsはworkoutへのFKを持たない汎用テーブルのため、workout削除より先に明示的に消す
    await prisma.reaction.deleteMany({ where: { userId: { in: [ownerId, memberId, outsiderId] } } })
    // workout_setsがexercisesを参照しているため、先にworkouts(cascadeでsetsも消える)を全削除してから消す
    await prisma.workout.deleteMany({ where: { userId: { in: [ownerId, memberId, outsiderId] } } })
    await prisma.exercise.deleteMany({ where: { id: exerciseId } })
  })

  it('未所属者には404を返す(IDOR対策)', async () => {
    const group = await createGroup()

    const agent = await loginAs(outsiderEmail)
    const res = await agent.get(`/groups/${group.id}/workouts`)

    expect(res.status).toBe(404)
  })

  it('退会済みメンバーには404を返す', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId, { leftAt: new Date() })

    const agent = await loginAs(memberEmail)
    const res = await agent.get(`/groups/${group.id}/workouts`)

    expect(res.status).toBe(404)
  })

  it('アクティブな全メンバー(本人含む)の記録を投稿者情報付きで新しい順に返す', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)

    const ownerWorkout = await prisma.workout.create({
      data: { userId: ownerId, performedAt: new Date('2026-01-10'), memo: 'オーナーの記録' },
    })
    const ownerSet = await prisma.workoutSet.create({
      data: { workoutId: ownerWorkout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 60 },
    })
    const memberWorkout = await prisma.workout.create({
      data: { userId: memberId, performedAt: new Date('2026-01-11') },
    })

    const agent = await loginAs(memberEmail)
    const res = await agent.get(`/groups/${group.id}/workouts`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      expect.objectContaining({
        id: memberWorkout.id,
        userId: memberId,
        displayName: 'グループテストメンバー',
        performedAt: '2026-01-11',
        memo: null,
        hasSets: false,
        exercises: [],
      }),
      expect.objectContaining({
        id: ownerWorkout.id,
        userId: ownerId,
        displayName: 'グループテストオーナー',
        performedAt: '2026-01-10',
        memo: 'オーナーの記録',
        hasSets: true,
        exercises: [
          {
            exerciseId,
            name: 'ベンチプレス',
            sets: [{ id: ownerSet.id, setOrder: 1, weightKg: 60, reps: 10 }],
          },
        ],
      }),
    ])
  })

  it('いいねの件数と自分がいいね済みかを含める', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)

    const ownerWorkout = await prisma.workout.create({
      data: { userId: ownerId, performedAt: new Date('2026-01-10') },
    })
    await prisma.reaction.create({
      data: { targetType: 'workout', targetId: ownerWorkout.id, userId: ownerId },
    })
    await prisma.reaction.create({
      data: { targetType: 'workout', targetId: ownerWorkout.id, userId: memberId },
    })

    const agent = await loginAs(memberEmail)
    const res = await agent.get(`/groups/${group.id}/workouts`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      expect.objectContaining({ id: ownerWorkout.id, reactionCount: 2, reactedByMe: true }),
    ])
  })

  it('いいねした人の表示名をいいねした順に含める(#149)', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)

    const ownerWorkout = await prisma.workout.create({
      data: { userId: ownerId, performedAt: new Date('2026-01-10') },
    })
    // memberが先にいいねし、その後ownerがいいねする(表示順が作成順であることを確認する)
    await prisma.reaction.create({
      data: { targetType: 'workout', targetId: ownerWorkout.id, userId: memberId },
    })
    await prisma.reaction.create({
      data: { targetType: 'workout', targetId: ownerWorkout.id, userId: ownerId },
    })

    const agent = await loginAs(memberEmail)
    const res = await agent.get(`/groups/${group.id}/workouts`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      expect.objectContaining({
        id: ownerWorkout.id,
        reactorNames: ['グループテストメンバー', 'グループテストオーナー'],
      }),
    ])
  })

  it('いいねが無い記録のreactorNamesは空配列', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)
    const ownerWorkout = await prisma.workout.create({
      data: { userId: ownerId, performedAt: new Date('2026-01-10') },
    })

    const agent = await loginAs(memberEmail)
    const res = await agent.get(`/groups/${group.id}/workouts`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      expect.objectContaining({ id: ownerWorkout.id, reactorNames: [] }),
    ])
  })

  it('コメントの件数を含める', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)

    const ownerWorkout = await prisma.workout.create({
      data: { userId: ownerId, performedAt: new Date('2026-01-10') },
    })
    await prisma.comment.create({
      data: { targetType: 'workout', targetId: ownerWorkout.id, userId: ownerId, body: '1件目' },
    })
    await prisma.comment.create({
      data: { targetType: 'workout', targetId: ownerWorkout.id, userId: memberId, body: '2件目' },
    })

    const agent = await loginAs(memberEmail)
    const res = await agent.get(`/groups/${group.id}/workouts`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([expect.objectContaining({ id: ownerWorkout.id, commentCount: 2 })])
  })

  it('未所属者(退会済み含む)の記録・ソフトデリート済みの記録は含めない', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId, { leftAt: new Date() })

    await prisma.workout.create({
      data: { userId: memberId, performedAt: new Date('2026-01-10') },
    })
    await prisma.workout.create({
      data: { userId: outsiderId, performedAt: new Date('2026-01-10') },
    })
    const deletedWorkout = await prisma.workout.create({
      data: { userId: ownerId, performedAt: new Date('2026-01-09'), deletedAt: new Date() },
    })

    const agent = await loginAs(ownerEmail)
    const res = await agent.get(`/groups/${group.id}/workouts`)

    expect(res.status).toBe(200)
    expect(res.body.map((w: { id: string }) => w.id)).not.toContain(deletedWorkout.id)
    expect(res.body).toEqual([])
  })
})

describe('POST /groups/:id/invite', () => {
  it('owner以外は403を返す(IDOR対策)', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)

    const agent = await loginAs(memberEmail)
    const res = await agent.post(`/groups/${group.id}/invite`)

    expect(res.status).toBe(403)
  })

  it('未所属者には404を返す', async () => {
    const group = await createGroup()

    const agent = await loginAs(outsiderEmail)
    const res = await agent.post(`/groups/${group.id}/invite`)

    expect(res.status).toBe(404)
  })

  it('ownerは招待コードを再発行でき、有効期限も延長される', async () => {
    const nearExpiry = new Date(Date.now() + 60 * 1000) // すぐ期限切れになる値からの延長を確認する
    const group = await createGroup({ inviteExpiresAt: nearExpiry })

    const agent = await loginAs(ownerEmail)
    const res = await agent.post(`/groups/${group.id}/invite`)

    expect(res.status).toBe(200)
    expect(res.body.inviteCode).not.toBe(group.inviteCode)
    expect(new Date(res.body.inviteExpiresAt).getTime()).toBeGreaterThan(nearExpiry.getTime())
  })

  it('再発行後は古い招待コードでは参加できなくなる', async () => {
    const group = await createGroup()
    const oldInviteCode = group.inviteCode

    const ownerAgent = await loginAs(ownerEmail)
    const reissueRes = await ownerAgent.post(`/groups/${group.id}/invite`)
    expect(reissueRes.status).toBe(200)

    const outsiderAgent = await loginAs(outsiderEmail)
    const joinRes = await outsiderAgent.post('/groups/join').send({ inviteCode: oldInviteCode })

    expect(joinRes.status).toBe(404)
    expect(joinRes.body.error).toBe('invalid_invite_code')
  })

  it('削除済みグループでは(元)ownerでも404を返す', async () => {
    const group = await createGroup()
    await prisma.group.update({ where: { id: group.id }, data: { deletedAt: new Date() } })

    const agent = await loginAs(ownerEmail)
    const res = await agent.post(`/groups/${group.id}/invite`)

    expect(res.status).toBe(404)
  })
})

describe('POST /groups/join', () => {
  it('招待コードが不正なら404を返す', async () => {
    const agent = await loginAs(outsiderEmail)
    const res = await agent.post('/groups/join').send({ inviteCode: 'no-such-code' })

    expect(res.status).toBe(404)
  })

  it('期限切れの招待コードは400を返す', async () => {
    const group = await createGroup({ inviteExpiresAt: new Date(Date.now() - 1000) })

    const agent = await loginAs(outsiderEmail)
    const res = await agent.post('/groups/join').send({ inviteCode: group.inviteCode })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invite_expired')
  })

  it('member_limitに達している場合は400を返す', async () => {
    const group = await createGroup({ memberLimit: 1 })

    const agent = await loginAs(outsiderEmail)
    const res = await agent.post('/groups/join').send({ inviteCode: group.inviteCode })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('member_limit_exceeded')
  })

  it('招待コードで新規参加できる', async () => {
    const group = await createGroup()

    const agent = await loginAs(outsiderEmail)
    const res = await agent.post('/groups/join').send({ inviteCode: group.inviteCode })

    expect(res.status).toBe(201)
    expect(res.body.role).toBe('member')
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: outsiderId } },
    })
    expect(membership?.leftAt).toBeNull()
  })

  it('退会済みメンバーは既存行をUPDATEする形で再参加する(新規INSERTしない)', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId, { leftAt: new Date('2026-01-01') })

    const agent = await loginAs(memberEmail)
    const res = await agent.post('/groups/join').send({ inviteCode: group.inviteCode })

    expect(res.status).toBe(201)
    const memberships = await prisma.groupMember.findMany({
      where: { groupId: group.id, userId: memberId },
    })
    expect(memberships).toHaveLength(1)
    expect(memberships[0]?.leftAt).toBeNull()
  })

  it('既にアクティブなメンバーが再度参加しようとすると200でそのまま返す', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)

    const agent = await loginAs(memberEmail)
    const res = await agent.post('/groups/join').send({ inviteCode: group.inviteCode })

    expect(res.status).toBe(200)
    expect(res.body.role).toBe('member')
  })
})

describe('POST /groups/:id/leave', () => {
  it('未所属者には404を返す', async () => {
    const group = await createGroup()

    const agent = await loginAs(outsiderEmail)
    const res = await agent.post(`/groups/${group.id}/leave`)

    expect(res.status).toBe(404)
  })

  it('唯一のownerは退会できない', async () => {
    const group = await createGroup()

    const agent = await loginAs(ownerEmail)
    const res = await agent.post(`/groups/${group.id}/leave`)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('sole_owner_cannot_leave')

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: ownerId } },
    })
    expect(membership?.leftAt).toBeNull()
  })

  it('ownerが複数いれば退会できる', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId, { role: 'owner' })

    const agent = await loginAs(ownerEmail)
    const res = await agent.post(`/groups/${group.id}/leave`)

    expect(res.status).toBe(204)
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: ownerId } },
    })
    expect(membership?.leftAt).not.toBeNull()
  })

  it('memberは退会できる', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)

    const agent = await loginAs(memberEmail)
    const res = await agent.post(`/groups/${group.id}/leave`)

    expect(res.status).toBe(204)
  })
})

describe('DELETE /groups/:id', () => {
  it('owner以外は403を返す(IDOR対策)', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)

    const agent = await loginAs(memberEmail)
    const res = await agent.delete(`/groups/${group.id}`)

    expect(res.status).toBe(403)
  })

  it('未所属者には404を返す', async () => {
    const group = await createGroup()

    const agent = await loginAs(outsiderEmail)
    const res = await agent.delete(`/groups/${group.id}`)

    expect(res.status).toBe(404)
  })

  it('ownerはグループをソフトデリートできる', async () => {
    const group = await createGroup()

    const agent = await loginAs(ownerEmail)
    const res = await agent.delete(`/groups/${group.id}`)

    expect(res.status).toBe(204)

    const deleted = await prisma.group.findUniqueOrThrow({ where: { id: group.id } })
    expect(deleted.deletedAt).not.toBeNull()
    // group_members側は変更されない(ソフトデリートはgroups側だけで表現する)
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: ownerId } },
    })
    expect(membership?.leftAt).toBeNull()
  })

  it('削除済みグループへのアクセスは404を返す', async () => {
    const group = await createGroup()
    await prisma.group.update({ where: { id: group.id }, data: { deletedAt: new Date() } })

    const agent = await loginAs(ownerEmail)
    const res = await agent.get(`/groups/${group.id}`)

    expect(res.status).toBe(404)
  })
})

describe('GET /groups/:id/ranking', () => {
  let officialExerciseId: string
  let customExerciseId: string

  beforeEach(async () => {
    const officialExercise = await prisma.exercise.create({
      data: { name: 'ベンチプレス', muscleGroup: 'chest' },
    })
    officialExerciseId = officialExercise.id
    const customExercise = await prisma.exercise.create({
      data: { name: 'オリジナル種目', muscleGroup: 'chest', createdBy: ownerId },
    })
    customExerciseId = customExercise.id
  })

  afterEach(async () => {
    await prisma.workout.deleteMany({ where: { userId: { in: [ownerId, memberId, outsiderId] } } })
    await prisma.exercise.deleteMany({ where: { id: { in: [officialExerciseId, customExerciseId] } } })
  })

  it('未所属者には404を返す(IDOR対策)', async () => {
    const group = await createGroup()

    const agent = await loginAs(outsiderEmail)
    const res = await agent.get(`/groups/${group.id}/ranking`)

    expect(res.status).toBe(404)
  })

  it('退会済みメンバーには404を返す', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId, { leftAt: new Date() })

    const agent = await loginAs(memberEmail)
    const res = await agent.get(`/groups/${group.id}/ranking`)

    expect(res.status).toBe(404)
  })

  it('periodが不正なら400を返す', async () => {
    const group = await createGroup()

    const agent = await loginAs(ownerEmail)
    const res = await agent.get(`/groups/${group.id}/ranking`).query({ period: 'year' })

    expect(res.status).toBe(400)
  })

  it('公式種目の合計挙上重量で降順に並べ、自重セットは0kg扱いで加算する', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)

    const today = new Date()
    const ownerWorkout = await prisma.workout.create({ data: { userId: ownerId, performedAt: today } })
    await prisma.workoutSet.create({
      data: { workoutId: ownerWorkout.id, exerciseId: officialExerciseId, setOrder: 1, reps: 10, weightKg: 50 },
    })
    // 自重セット(weightKg null)は0kg扱いで加算される(合計には影響しない)
    await prisma.workoutSet.create({
      data: { workoutId: ownerWorkout.id, exerciseId: officialExerciseId, setOrder: 2, reps: 20, weightKg: null },
    })

    const memberWorkout = await prisma.workout.create({ data: { userId: memberId, performedAt: today } })
    await prisma.workoutSet.create({
      data: { workoutId: memberWorkout.id, exerciseId: officialExerciseId, setOrder: 1, reps: 10, weightKg: 80 },
    })
    // カスタム種目は集計対象外
    await prisma.workoutSet.create({
      data: { workoutId: memberWorkout.id, exerciseId: customExerciseId, setOrder: 2, reps: 10, weightKg: 999 },
    })

    const agent = await loginAs(ownerEmail)
    const res = await agent.get(`/groups/${group.id}/ranking`).query({ period: 'all' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      period: 'all',
      ranking: [
        { userId: memberId, displayName: 'グループテストメンバー', totalVolumeKg: 800, rank: 1 },
        { userId: ownerId, displayName: 'グループテストオーナー', totalVolumeKg: 500, rank: 2 },
      ],
    })
  })

  it('記録が無いメンバーも0kgで一覧に含める', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)

    const agent = await loginAs(ownerEmail)
    const res = await agent.get(`/groups/${group.id}/ranking`).query({ period: 'all' })

    expect(res.status).toBe(200)
    expect(res.body.ranking).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: ownerId, totalVolumeKg: 0 }),
        expect.objectContaining({ userId: memberId, totalVolumeKg: 0 }),
      ]),
    )
  })

  it('同着は同順位、次の順位は人数分スキップする(1,2,2,4)', async () => {
    const group = await createGroup()
    await addMember(group.id, memberId)
    const passwordHash = await bcrypt.hash(testPassword, 12)
    const thirdUser = await prisma.user.create({
      data: { email: 'groups-ranking-third@example.com', passwordHash, displayName: '三人目' },
    })
    await addMember(group.id, thirdUser.id)

    const today = new Date()
    const ownerWorkout = await prisma.workout.create({ data: { userId: ownerId, performedAt: today } })
    await prisma.workoutSet.create({
      data: { workoutId: ownerWorkout.id, exerciseId: officialExerciseId, setOrder: 1, reps: 10, weightKg: 50 },
    })
    const memberWorkout = await prisma.workout.create({ data: { userId: memberId, performedAt: today } })
    await prisma.workoutSet.create({
      data: { workoutId: memberWorkout.id, exerciseId: officialExerciseId, setOrder: 1, reps: 10, weightKg: 50 },
    })
    // thirdUserは記録なし(0kg)

    const agent = await loginAs(ownerEmail)
    const res = await agent.get(`/groups/${group.id}/ranking`).query({ period: 'all' })

    expect(res.status).toBe(200)
    const ranks = res.body.ranking.map((r: { userId: string; rank: number }) => r.rank)
    expect(ranks).toEqual([1, 1, 3])

    await prisma.user.delete({ where: { id: thirdUser.id } })
  })
})
