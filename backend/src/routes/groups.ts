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

  // マイページの所属グループ一覧（名前・人数・自分の役割）用に現在の所属人数を添える(Issue #237)
  const memberCounts = await prisma.groupMember.groupBy({
    by: ['groupId'],
    where: { groupId: { in: memberships.map((m) => m.groupId) }, leftAt: null },
    _count: { _all: true },
  })
  const memberCountByGroupId = new Map(memberCounts.map((c) => [c.groupId, c._count._all]))

  res.status(200).json(
    memberships.map((m) => ({
      ...serializeGroup(m.group),
      role: m.role,
      memberCount: memberCountByGroupId.get(m.groupId) ?? 0,
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

  // performedAtは日付のみ(時刻を持たない)のため、同じ日に複数件記録すると
  // performedAtだけでは同値行の順序が不定になる。createdAtをtie-breakにして登録順(新しい順)を保証する
  const workouts = await prisma.workout.findMany({
    where: { userId: { in: memberIds }, deletedAt: null },
    orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      user: { select: { displayName: true } },
      sets: {
        orderBy: [{ setOrder: 'asc' }, { createdAt: 'asc' }],
        include: { exercise: { select: { name: true } } },
      },
      // 種目カードの並び順の正(Issue #228)。下のexercisesByIdでこの順にグルーピングし直す
      exercises: { orderBy: { sortOrder: 'asc' }, select: { exerciseId: true } },
    },
  })

  // いいね(reactions)は「誰がいいねしたか」の表示(#149)に使うため、件数・自分のいいね有無に加えて
  // reactorのdisplayNameも1クエリでまとめて取る(件数・reactorNamesとも同じ行から導出できるため、
  // 従来あったgroupByでの件数集計クエリは不要になった)
  // コメント数はgroupByし1クエリで済ませる(一覧では件数のみ必要で、コメント本文は展開時に
  // GET /workouts/:id/commentsで別途取得する)
  const workoutIds = workouts.map((w) => w.id)
  const [reactions, commentCounts] = await Promise.all([
    prisma.reaction.findMany({
      where: { targetType: 'workout', targetId: { in: workoutIds } },
      orderBy: { createdAt: 'asc' },
      select: { targetId: true, userId: true, user: { select: { displayName: true } } },
    }),
    prisma.comment.groupBy({
      by: ['targetId'],
      where: { targetType: 'workout', targetId: { in: workoutIds } },
      _count: { _all: true },
    }),
  ])
  const reactorNamesByWorkoutId = new Map<string, string[]>()
  const myReactedWorkoutIds = new Set<string>()
  for (const r of reactions) {
    const names = reactorNamesByWorkoutId.get(r.targetId) ?? []
    names.push(r.user.displayName)
    reactorNamesByWorkoutId.set(r.targetId, names)
    if (r.userId === userId) myReactedWorkoutIds.add(r.targetId)
  }
  const commentCountByWorkoutId = new Map(commentCounts.map((c) => [c.targetId, c._count._all]))

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
      // 種目カードの並びはw.exercises(WorkoutExercise.sortOrder昇順)を正とする(Issue #228)
      const orderedExerciseIds = w.exercises.map((e) => e.exerciseId)
      return {
        id: w.id,
        userId: w.userId,
        displayName: w.user.displayName,
        performedAt: w.performedAt.toISOString().slice(0, 10),
        memo: w.memo,
        hasSets: w.sets.length > 0,
        reactionCount: reactorNamesByWorkoutId.get(w.id)?.length ?? 0,
        reactedByMe: myReactedWorkoutIds.has(w.id),
        // いいねした人の表示名(#149)。いいねした順(古い順)に並ぶ
        reactorNames: reactorNamesByWorkoutId.get(w.id) ?? [],
        commentCount: commentCountByWorkoutId.get(w.id) ?? 0,
        exercises: orderedExerciseIds.map((exerciseId) => {
          const { name, sets } = setsByExercise.get(exerciseId)!
          return {
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
          }
        }),
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

    // 新メンバー参加の通知(Issue #249)。初回参加・再参加のどちらでも、そのグループの他のアクティブな
    // メンバー宛に作る。表示は作成から5分後で、その時点で参加者・受信者が今もメンバーかを確認し直す
    // (notifications.tsのfindVisibleNotifications参照)
    const otherMembers = await tx.groupMember.findMany({
      where: { groupId: group.id, leftAt: null, userId: { not: userId } },
      select: { userId: true },
    })
    await tx.notification.createMany({
      data: otherMembers.map((m) => ({
        recipientId: m.userId,
        actorId: userId,
        type: 'member_joined' as const,
        targetType: 'group' as const,
        targetId: group.id,
      })),
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

// 集計対象は公式種目のみ(createdBy IS NULL)。stats.ts(Phase3-C)と同じ方針
const RANKING_OFFICIAL_EXERCISE_FILTER = { createdBy: null }

// 種目別ランキングのデフォルト種目選定に使う「直近」の窓。②ホーム・⑨マイページの期間別サマリー
// (直近28日、spec.md「記録日数」実装メモ参照)と同じ定義に揃え、アプリ内で「直近」の意味を統一する
const RECENT_WINDOW_DAYS = 28

function recentWindowStart(now: Date): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - RECENT_WINDOW_DAYS)
  return start
}

// 参加・継続の可視化(非順位)用のスタンプ段階。順位ではなく「自分がどの段階にいるか」に焦点が
// 移るよう、直近28日の実日数を生の数字ではなく4段階のスタンプに変換して見せる
// (backlog.md「通知の種類の拡張」で決めた『途切れを責めず積み上げを祝う』方針と揃える)。
// フロント側の見た目はブランドオレンジの濃淡4段階（表彰台の金・銀・銅とは別配色。
// 隣に並ぶ順位バッジと混同しやすいという指摘を受けて別軸にした、2026-09-24）。
// bronze/silver/goldという名前はこのAPIの型名として残すが、表示文言には出さない
type AttendanceStamp = 'none' | 'bronze' | 'silver' | 'gold'

function attendanceStamp(daysTrained: number): AttendanceStamp {
  if (daysTrained >= 18) return 'gold' // 週4日超のペース
  if (daysTrained >= 7) return 'silver' // 週1〜2日程度のペース
  if (daysTrained >= 1) return 'bronze'
  return 'none'
}

const rankingPeriodSchema = z.object({
  period: z.enum(['week', 'month', 'all']).default('week'),
  exerciseId: z.string().uuid().optional(),
})

// todayを含む週の開始日(直近の日曜日、時刻0時)を返す。
// 週の定義はPhase3-D(frontend/app/utils/weeklySummary.ts)と統一(日曜始まり〜土曜)
function weekStart(now: Date): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return start
}

// todayを含む月の開始日(1日、時刻0時)を返す
function monthStart(now: Date): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(1)
  return start
}

// periodから「performedAt >= このtimestamp」の下限を計算する。allはundefined(下限なし)。
// 過去の期間ではなく「現在進行中の期間の集計」のみを扱うため、上限(終了日)は設けない
function rankingStartDate(period: 'week' | 'month' | 'all'): Date | undefined {
  if (period === 'all') return undefined
  const now = new Date()
  return period === 'week' ? weekStart(now) : monthStart(now)
}

// GET /groups/:id/ranking?period=week|month|all&exerciseId=<uuid>
// グループのアクティブな全メンバー(本人含む)について、公式種目の合計挙上重量(Σ weightKg * reps)
// でランキングを作る。自重セット(weightKgがnull)は0kg扱いで加算する(stats.tsは自重セットを
// 集計から除外するが、ランキングは「0kgとして扱う」ことで記録自体はしている点を評価する。
// schema.md「Phase4の検討結果」参照)。
// exerciseIdを指定すると、その種目だけの挙上重量に絞った「種目別ランキング」になる
// (対象は既存方針どおり公式種目のみ。カスタム種目・存在しないIDはstats.tsの種目別推移と同じく404)
groupsRouter.get('/:id/ranking', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const groupId = req.params.id as string

  const parsed = rankingPeriodSchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }

  const membership = await findActiveMembership(userId, groupId)
  if (!membership) {
    // 未所属者には存在の有無も返さない(IDOR対策)
    res.status(404).json({ error: 'not_found' })
    return
  }

  let exerciseId: string | undefined
  if (parsed.data.exerciseId) {
    const exercise = await prisma.exercise.findFirst({
      where: { id: parsed.data.exerciseId, ...RANKING_OFFICIAL_EXERCISE_FILTER },
    })
    if (!exercise) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    exerciseId = exercise.id
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId, leftAt: null },
    include: { user: { select: { displayName: true } } },
  })
  const memberIds = members.map((m) => m.userId)

  const startDate = rankingStartDate(parsed.data.period)
  const sets = await prisma.workoutSet.findMany({
    where: {
      workout: {
        userId: { in: memberIds },
        deletedAt: null,
        ...(startDate ? { performedAt: { gte: startDate } } : {}),
      },
      exercise: RANKING_OFFICIAL_EXERCISE_FILTER,
      ...(exerciseId ? { exerciseId } : {}),
    },
    select: { weightKg: true, reps: true, workout: { select: { userId: true } } },
  })

  // 記録が無いメンバーも0kgで一覧に含めるため、先に全メンバーを0で初期化しておく
  const volumeByUserId = new Map<string, number>(memberIds.map((id) => [id, 0]))
  for (const set of sets) {
    const weightKg = set.weightKg === null ? 0 : Number(set.weightKg)
    const uid = set.workout.userId
    volumeByUserId.set(uid, (volumeByUserId.get(uid) ?? 0) + weightKg * set.reps)
  }

  // 参加・継続の可視化用に、種目・期間タブとは独立して「直近28日にセットがある日数」を集計する
  // (workouts.tsのcountDaysWithSetsと同じ「セットが1件以上ある日=workout」の数え方。
  // 種目には依存しないグループ全体のトレ日数のため、公式種目フィルタもかけない)
  const attendanceCounts = await prisma.workout.groupBy({
    by: ['userId'],
    where: {
      userId: { in: memberIds },
      deletedAt: null,
      performedAt: { gte: recentWindowStart(new Date()) },
      sets: { some: {} },
    },
    _count: { _all: true },
  })
  const daysTrainedByUserId = new Map<string, number>(
    attendanceCounts.map((c) => [c.userId, c._count._all]),
  )

  // 合計挙上重量の降順。同点はdisplayNameで安定した順序にする(表示上の並びをブレさせないため)
  const sorted = members
    .map((m) => {
      const daysTrained = daysTrainedByUserId.get(m.userId) ?? 0
      return {
        userId: m.userId,
        displayName: m.user.displayName,
        totalVolumeKg: volumeByUserId.get(m.userId) ?? 0,
        daysTrained,
        attendanceStamp: attendanceStamp(daysTrained),
      }
    })
    .sort((a, b) => b.totalVolumeKg - a.totalVolumeKg || a.displayName.localeCompare(b.displayName))

  // 同着は同順位、次の順位は人数分スキップする方式(例: 1,2,2,4)
  let rank = 0
  let prevVolumeKg: number | null = null
  const ranking = sorted.map((entry, index) => {
    if (entry.totalVolumeKg !== prevVolumeKg) {
      rank = index + 1
      prevVolumeKg = entry.totalVolumeKg
    }
    return { ...entry, rank }
  })

  res.status(200).json({ period: parsed.data.period, exerciseId: exerciseId ?? null, ranking })
})

// GET /groups/:id/ranking/default-exercise
// 種目別ランキングを開いたときに最初に選択する種目を返す。グループのアクティブメンバー全員の
// 直近28日間のセット数が最も多い公式種目(タイは種目一覧と同じ表示順→名前順で解決)。
// 該当するセットが1件も無ければexerciseId: nullを返す(フロント側は種目未選択の状態で表示する)
groupsRouter.get('/:id/ranking/default-exercise', requireAuth, async (req, res) => {
  const userId = req.session.userId!
  const groupId = req.params.id as string

  const membership = await findActiveMembership(userId, groupId)
  if (!membership) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId, leftAt: null },
    select: { userId: true },
  })
  const memberIds = members.map((m) => m.userId)

  const counts = await prisma.workoutSet.groupBy({
    by: ['exerciseId'],
    where: {
      workout: {
        userId: { in: memberIds },
        deletedAt: null,
        performedAt: { gte: recentWindowStart(new Date()) },
      },
      exercise: RANKING_OFFICIAL_EXERCISE_FILTER,
    },
    _count: { _all: true },
  })

  if (counts.length === 0) {
    res.status(200).json({ exerciseId: null })
    return
  }

  const maxCount = Math.max(...counts.map((c) => c._count._all))
  const topExerciseIds = counts.filter((c) => c._count._all === maxCount).map((c) => c.exerciseId)

  // 同数のタイは種目一覧(GET /exercises)と同じ「表示順→名前順」で解決する
  const topExercise = await prisma.exercise.findFirst({
    where: { id: { in: topExerciseIds } },
    orderBy: [{ defaultSortOrder: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
  })

  res.status(200).json({ exerciseId: topExercise?.id ?? null })
})

// GET /groups/:id/ranking/exercises
// 種目別ランキングの種目セレクタに出す候補を返す。公式種目は77種目あり全件出すと選びづらいため、
// グループのアクティブメンバーの誰か1人でも記録したことがある種目だけに絞り込む(期間の下限は
// 設けず、過去の全期間が対象。default-exerciseの「直近28日」とは別軸)。使用実績が無い種目は、
// 通算で見ても0kgランキングにしかならず実用上の価値が薄いため候補から外す
// (2026-09-25決定、docs/spec.md参照)
groupsRouter.get('/:id/ranking/exercises', requireAuth, async (req, res) => {
  const userId = req.session.userId!
  const groupId = req.params.id as string

  const membership = await findActiveMembership(userId, groupId)
  if (!membership) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId, leftAt: null },
    select: { userId: true },
  })
  const memberIds = members.map((m) => m.userId)

  const counts = await prisma.workoutSet.groupBy({
    by: ['exerciseId'],
    where: {
      workout: { userId: { in: memberIds }, deletedAt: null },
      exercise: RANKING_OFFICIAL_EXERCISE_FILTER,
    },
    _count: { _all: true },
  })
  const countByExerciseId = new Map(counts.map((c) => [c.exerciseId, c._count._all]))

  // 使用回数の多い順。同数はdefault-exerciseと同じ「表示順→名前順」で解決する
  const usedExercises = await prisma.exercise.findMany({
    where: { id: { in: [...countByExerciseId.keys()] } },
    orderBy: [{ defaultSortOrder: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    select: { id: true, name: true },
  })
  usedExercises.sort(
    (a, b) => (countByExerciseId.get(b.id) ?? 0) - (countByExerciseId.get(a.id) ?? 0),
  )

  res.status(200).json({ exercises: usedExercises })
})
