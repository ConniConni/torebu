import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { GroupModel, GroupMemberModel } from '../generated/prisma/models.js'

export const groupsRouter = Router()

// 招待コードの有効期限。再発行のたびにこの日数分先へ更新する(docs/schema.mdのinvite_expires_at参照)。
// member_limitによる人数制限が主な歯止めのため、期限自体は「長期間放置されたリンクを無効化する」
// ための保険という位置づけで、控えめに長めの日数にしている
const INVITE_CODE_EXPIRY_DAYS = 30

function generateInviteCode() {
  // 英数字32文字程度(docs/schema.md)。base64urlは[A-Za-z0-9_-]なのでURLにもそのまま使える
  return randomBytes(24).toString('base64url')
}

function inviteExpiresAt() {
  return new Date(Date.now() + INVITE_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
}

function serializeGroup(group: GroupModel) {
  return {
    id: group.id,
    name: group.name,
    memberLimit: group.memberLimit,
    inviteCode: group.inviteCode,
    inviteExpiresAt: group.inviteExpiresAt,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  }
}

function serializeMember(member: GroupMemberModel & { user: { displayName: string } }) {
  return {
    userId: member.userId,
    displayName: member.user.displayName,
    role: member.role,
    joinedAt: member.joinedAt,
  }
}

// 退会済み(leftAt有り)は対象外。アクティブなメンバーシップのみを「所属」として扱う
async function findActiveMembership(userId: string, groupId: string) {
  return prisma.groupMember.findFirst({
    where: { userId, groupId, leftAt: null, group: { deletedAt: null } },
  })
}

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(50),
})

groupsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  // 作成者を自動的にownerとして参加させる。1トランザクションでグループ作成とメンバー登録をまとめて行う
  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.group.create({
      data: {
        name: parsed.data.name,
        createdBy: userId,
        inviteCode: generateInviteCode(),
        inviteExpiresAt: inviteExpiresAt(),
      },
    })
    await tx.groupMember.create({
      data: { groupId: created.id, userId, role: 'owner' },
    })
    return created
  })

  res.status(201).json({ ...serializeGroup(group), role: 'owner' as const })
})

groupsRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  const memberships = await prisma.groupMember.findMany({
    where: { userId, leftAt: null, group: { deletedAt: null } },
    include: { group: true },
    orderBy: { joinedAt: 'desc' },
  })

  res.status(200).json(
    memberships.map((m) => ({
      ...serializeGroup(m.group),
      role: m.role,
    })),
  )
})

groupsRouter.get('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const groupId = req.params.id as string

  const membership = await findActiveMembership(userId, groupId)
  if (!membership) {
    // 未所属者には存在の有無も返さない(IDOR対策)
    res.status(404).json({ error: 'not_found' })
    return
  }

  const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId } })
  const members = await prisma.groupMember.findMany({
    where: { groupId, leftAt: null },
    include: { user: { select: { displayName: true } } },
    orderBy: { joinedAt: 'asc' },
  })

  res.status(200).json({
    ...serializeGroup(group),
    role: membership.role,
    members: members.map(serializeMember),
  })
})

groupsRouter.get('/:id/workouts', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const groupId = req.params.id as string

  const membership = await findActiveMembership(userId, groupId)
  if (!membership) {
    // 未所属者には存在の有無も返さない(IDOR対策)
    res.status(404).json({ error: 'not_found' })
    return
  }

  // このグループのアクティブなメンバー全員(本人含む)のworkoutを対象にする
  const memberIds = (
    await prisma.groupMember.findMany({
      where: { groupId, leftAt: null },
      select: { userId: true },
    })
  ).map((m) => m.userId)

  const workouts = await prisma.workout.findMany({
    where: { userId: { in: memberIds }, deletedAt: null },
    orderBy: { performedAt: 'desc' },
    include: {
      user: { select: { displayName: true } },
      sets: { include: { exercise: { select: { name: true } } } },
    },
  })

  res.status(200).json(
    workouts.map((w) => {
      // 種目ごとにセットをグルーピングして返す(②ホームの記録カードと同じ構造。frontend/app/pages/index.vueの
      // workoutGroups参照)。フィードではアコーディオン展開でセットの重量・回数まで見せるため、
      // サマリー(件数)だけでなく個々のセットを含める
      const setsByExercise = new Map<string, { name: string; sets: (typeof w.sets)[number][] }>()
      for (const set of w.sets) {
        const entry = setsByExercise.get(set.exerciseId) ?? { name: set.exercise.name, sets: [] }
        entry.sets.push(set)
        setsByExercise.set(set.exerciseId, entry)
      }
      return {
        id: w.id,
        userId: w.userId,
        displayName: w.user.displayName,
        performedAt: w.performedAt.toISOString().slice(0, 10),
        memo: w.memo,
        hasSets: w.sets.length > 0,
        exercises: [...setsByExercise.entries()].map(([exerciseId, { name, sets }]) => ({
          exerciseId,
          name,
          sets: sets
            .sort((a, b) => a.setOrder - b.setOrder)
            .map((s) => ({
              id: s.id,
              setOrder: s.setOrder,
              weightKg: s.weightKg === null ? null : Number(s.weightKg),
              reps: s.reps,
            })),
        })),
      }
    }),
  )
})

groupsRouter.post('/:id/invite', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const groupId = req.params.id as string

  const membership = await findActiveMembership(userId, groupId)
  if (!membership) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  if (membership.role !== 'owner') {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const updated = await prisma.group.update({
    where: { id: groupId },
    data: { inviteCode: generateInviteCode(), inviteExpiresAt: inviteExpiresAt() },
  })

  res.status(200).json(serializeGroup(updated))
})

const joinGroupSchema = z.object({
  inviteCode: z.string().trim().min(1),
})

groupsRouter.post('/join', requireAuth, async (req, res) => {
  const parsed = joinGroupSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  const group = await prisma.group.findFirst({
    where: { inviteCode: parsed.data.inviteCode, deletedAt: null },
  })
  if (!group) {
    res.status(404).json({ error: 'invalid_invite_code' })
    return
  }
  if (group.inviteExpiresAt && group.inviteExpiresAt < new Date()) {
    res.status(400).json({ error: 'invite_expired' })
    return
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId } },
    })
    if (existing && existing.leftAt === null) {
      return { status: 'already_member' as const, membership: existing }
    }

    // member_limitの「あと何人入れるか」は別カウンタを持たず、都度アクティブなメンバー数を数えて判定する
    // (docs/schema.md「設計方針メモ」参照)
    const activeCount = await tx.groupMember.count({ where: { groupId: group.id, leftAt: null } })
    if (activeCount >= group.memberLimit) {
      return { status: 'member_limit_exceeded' as const, membership: null }
    }

    // 退会済みメンバーの再参加は新規INSERTではなくUPDATE(leftAtをNULLに戻す)で行う
    const membership = existing
      ? await tx.groupMember.update({
          where: { groupId_userId: { groupId: group.id, userId } },
          data: { leftAt: null },
        })
      : await tx.groupMember.create({
          data: { groupId: group.id, userId, role: 'member' },
        })
    return { status: 'joined' as const, membership }
  })

  if (result.status === 'member_limit_exceeded') {
    res.status(400).json({ error: 'member_limit_exceeded' })
    return
  }

  res.status(result.status === 'joined' ? 201 : 200).json({
    ...serializeGroup(group),
    role: result.membership!.role,
  })
})

groupsRouter.post('/:id/leave', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const groupId = req.params.id as string

  const membership = await findActiveMembership(userId, groupId)
  if (!membership) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  if (membership.role === 'owner') {
    const activeOwnerCount = await prisma.groupMember.count({
      where: { groupId, role: 'owner', leftAt: null },
    })
    if (activeOwnerCount <= 1) {
      res.status(400).json({ error: 'sole_owner_cannot_leave' })
      return
    }
  }

  await prisma.groupMember.update({
    where: { groupId_userId: { groupId, userId } },
    data: { leftAt: new Date() },
  })

  res.status(204).send()
})

groupsRouter.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const groupId = req.params.id as string

  const membership = await findActiveMembership(userId, groupId)
  if (!membership) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  if (membership.role !== 'owner') {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  // ソフトデリート。退会と違いgroup_members側は変更しない(グループ自体をdeleted_atで無効化する)
  await prisma.group.update({ where: { id: groupId }, data: { deletedAt: new Date() } })

  res.status(204).send()
})
