import { Router } from 'express'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { NotificationModel } from '../generated/prisma/models.js'

export const notificationsRouter = Router()

// 一覧に出す件数の上限(Phase4初弾はページングを設けず、直近分のみ返す)。
// 未読件数・一括既読もこの範囲を対象にする(一覧とバッジの件数を揃えるため。Issue #249)
const LIST_LIMIT = 50

// 保存と同時に表示する種類(いいね・コメント)。対象はいずれも記録(workout)
const IMMEDIATE_TYPES = ['reaction', 'comment', 'comment_reply'] as const
// 作成から一定時間経つまで表示しない種類(Issue #249。docs/backlog.md「通知の種類の拡張」)。
// 誤操作(参加してすぐ退会する等)で通知が出ないよう、通知自体は即時に作り、表示側で遅らせる。
// 表示時には条件がまだ成り立っているかを確認し直す(下のfindVisibleNotifications参照)
const DELAYED_TYPES = ['member_joined', 'personal_best', 'milestone', 'comeback'] as const
const DISPLAY_DELAY_MS = 5 * 60 * 1000

// 通知1件を表示するための対象記録の要約(日付・種目名の先頭1件・種目数)。
// workoutが既に削除されている(ソフトデリート含む)場合はnullを返し、呼び出し側で除外する
async function summarizeWorkoutTargets(workoutIds: string[]) {
  const workouts = await prisma.workout.findMany({
    where: { id: { in: workoutIds }, deletedAt: null },
    include: {
      sets: {
        orderBy: { setOrder: 'asc' },
        include: { exercise: { select: { name: true } } },
      },
    },
  })

  const summaryByWorkoutId = new Map<
    string,
    { performedAt: string; exerciseName: string | null; exerciseCount: number }
  >()
  for (const workout of workouts) {
    const exerciseNames = [...new Set(workout.sets.map((s) => s.exercise.name))]
    summaryByWorkoutId.set(workout.id, {
      performedAt: workout.performedAt.toISOString().slice(0, 10),
      exerciseName: exerciseNames[0] ?? null,
      exerciseCount: exerciseNames.length,
    })
  }
  return summaryByWorkoutId
}

// 通知を開いたときの遷移先をグループの記録フィード(いいね・コメントが見える画面)にするため、
// 各actorと自分(recipient)が現在も同席しているアクティブなグループを1つ引く(無ければnull)。
// workouts.tsのshareActiveGroupと同じ判定基準(leftAt/group.deletedAt)をactor複数分まとめて引く形
async function findSharedGroupIds(recipientId: string, actorIds: string[]) {
  const map = new Map<string, string>()
  if (actorIds.length === 0) return map

  const recipientGroupIds = (
    await prisma.groupMember.findMany({
      where: { userId: recipientId, leftAt: null, group: { deletedAt: null } },
      select: { groupId: true },
    })
  ).map((g) => g.groupId)
  if (recipientGroupIds.length === 0) return map

  const rows = await prisma.groupMember.findMany({
    where: { userId: { in: actorIds }, leftAt: null, groupId: { in: recipientGroupIds } },
    select: { userId: true, groupId: true },
  })
  for (const row of rows) {
    if (!map.has(row.userId)) map.set(row.userId, row.groupId)
  }
  return map
}

// member_joined通知の表示可否と表示内容(グループ名)を引く。表示してよいのは、グループが削除されておらず、
// 参加者(actor)と受信者がどちらも今もそのグループのアクティブなメンバーである場合のみ
// (参加後5分以内に退会した・受信者が退会した等の場合は表示しない)
async function resolveMemberJoinedTargets(
  recipientId: string,
  notifications: Pick<NotificationModel, 'actorId' | 'targetId'>[],
) {
  const groupIds = [...new Set(notifications.map((n) => n.targetId))]
  const userIds = [
    ...new Set([recipientId, ...notifications.map((n) => n.actorId).filter((id) => id !== null)]),
  ]
  if (groupIds.length === 0)
    return { groupNameById: new Map<string, string>(), isActiveMember: () => false }

  const [groups, memberships] = await Promise.all([
    prisma.group.findMany({
      where: { id: { in: groupIds }, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.groupMember.findMany({
      where: { groupId: { in: groupIds }, userId: { in: userIds }, leftAt: null },
      select: { groupId: true, userId: true },
    }),
  ])
  const activeMemberKeys = new Set(memberships.map((m) => `${m.groupId}:${m.userId}`))
  return {
    groupNameById: new Map(groups.map((g) => [g.id, g.name])),
    isActiveMember: (groupId: string, userId: string) =>
      activeMemberKeys.has(`${groupId}:${userId}`),
  }
}

// personal_best通知(Issue #253)のpayload。作成時点の種目IDと更新前のベスト(kg)
function parsePersonalBestPayload(payload: NotificationModel['payload']) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const { exerciseId, previousBestKg } = payload as Record<string, unknown>
  if (typeof exerciseId !== 'string' || typeof previousBestKg !== 'number') return null
  return { exerciseId, previousBestKg }
}

// personal_best通知の表示内容を取得時点の状態で引き直す(記録の日付・種目名・その記録のその種目の現在の最大重量)。
// 記録が削除済み・行為者の記録でない・その種目のセットが無くなった(自重だけになった)場合は、キーがMapに入らない
async function resolvePersonalBestTargets(
  notifications: Pick<NotificationModel, 'actorId' | 'targetId' | 'payload'>[],
) {
  const summaryByKey = new Map<
    string,
    { performedAt: string; exerciseName: string; weightKg: number }
  >()
  const payloads = notifications
    .map((n) => ({ n, payload: parsePersonalBestPayload(n.payload) }))
    .filter((p) => p.payload !== null)
  if (payloads.length === 0) return summaryByKey

  const workoutIds = [...new Set(payloads.map((p) => p.n.targetId))]
  const exerciseIds = [...new Set(payloads.map((p) => p.payload!.exerciseId))]
  const [workouts, maxWeights, exercises] = await Promise.all([
    prisma.workout.findMany({
      where: { id: { in: workoutIds }, deletedAt: null },
      select: { id: true, userId: true, performedAt: true },
    }),
    prisma.workoutSet.groupBy({
      by: ['workoutId', 'exerciseId'],
      where: { workoutId: { in: workoutIds }, exerciseId: { in: exerciseIds } },
      _max: { weightKg: true },
    }),
    prisma.exercise.findMany({
      where: { id: { in: exerciseIds } },
      select: { id: true, name: true },
    }),
  ])
  const workoutById = new Map(workouts.map((w) => [w.id, w]))
  const maxWeightByKey = new Map(
    maxWeights
      .filter((m) => m._max.weightKg !== null)
      .map((m) => [`${m.workoutId}:${m.exerciseId}`, Number(m._max.weightKg)]),
  )
  const exerciseNameById = new Map(exercises.map((e) => [e.id, e.name]))

  for (const { n, payload } of payloads) {
    const key = `${n.targetId}:${payload!.exerciseId}`
    const workout = workoutById.get(n.targetId)
    const weightKg = maxWeightByKey.get(key)
    const exerciseName = exerciseNameById.get(payload!.exerciseId)
    if (!workout || workout.userId !== n.actorId || weightKg === undefined || !exerciseName)
      continue
    summaryByKey.set(key, {
      performedAt: workout.performedAt.toISOString().slice(0, 10),
      exerciseName,
      weightKg,
    })
  }
  return summaryByKey
}

// milestone通知(Issue #255)のpayload。作成時点の節目の日数
function parseMilestonePayload(payload: NotificationModel['payload']) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const { days } = payload as Record<string, unknown>
  if (typeof days !== 'number') return null
  return { days }
}

// milestone・comeback通知(Issue #255)の表示内容を取得時点の状態で引き直す(記録の日付)。
// 記録が削除済み・行為者の記録でない場合は、キーがMapに入らない
async function resolveAchievementTargets(
  notifications: Pick<NotificationModel, 'actorId' | 'targetId'>[],
) {
  const summaryByWorkoutId = new Map<string, { performedAt: string }>()
  if (notifications.length === 0) return summaryByWorkoutId

  const workoutIds = [...new Set(notifications.map((n) => n.targetId))]
  const actorIdByWorkoutId = new Map(notifications.map((n) => [n.targetId, n.actorId]))
  const workouts = await prisma.workout.findMany({
    where: { id: { in: workoutIds }, deletedAt: null },
    select: { id: true, userId: true, performedAt: true },
  })
  for (const workout of workouts) {
    if (workout.userId !== actorIdByWorkoutId.get(workout.id)) continue
    summaryByWorkoutId.set(workout.id, {
      performedAt: workout.performedAt.toISOString().slice(0, 10),
    })
  }
  return summaryByWorkoutId
}

type WorkoutTarget = {
  type: 'workout'
  workoutId: string
  groupId: string | null
  performedAt: string
  exerciseName: string | null
  exerciseCount: number
}
type GroupTarget = { type: 'group'; groupId: string; groupName: string }
type PersonalBestTarget = {
  type: 'personal_best'
  workoutId: string
  groupId: string
  performedAt: string
  exerciseId: string
  exerciseName: string
  weightKg: number
}
type MilestoneTarget = {
  type: 'milestone'
  workoutId: string
  groupId: string
  performedAt: string
  days: number
}
type ComebackTarget = { type: 'comeback'; workoutId: string; groupId: string; performedAt: string }

// 「表示してよい通知か」の共通判定(Issue #249)。一覧・未読件数・一括既読の3つのAPIで使い、
// 3つの結果(一覧に出る通知・バッジの件数・既読になる通知)がずれないようにする。
// - 遅延対象の種類は、作成から5分経ったものだけをDBの取得条件で絞る(アプリ側で除外すると、
//   直近50件の枠を未表示の通知が消費してしまうため)
// - 取得後、種類ごとに対象がまだ有効かを確認し直し、無効なものは除外する
//   (記録が削除済み／member_joinedの参加者・受信者が退会済み・グループが削除済み／
//   personal_bestの自己ベストが取り消された・行為者と共通のアクティブなグループが無くなった)
async function findVisibleNotifications(userId: string) {
  const notifications = await prisma.notification.findMany({
    where: {
      recipientId: userId,
      OR: [
        { type: { in: [...IMMEDIATE_TYPES] } },
        {
          type: { in: [...DELAYED_TYPES] },
          createdAt: { lte: new Date(Date.now() - DISPLAY_DELAY_MS) },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    include: { actor: { select: { id: true, displayName: true } } },
  })

  // 種類ごとに期待する対象(targetType)と一致するものだけを扱う
  const workoutNotifications = notifications.filter(
    (n) => IMMEDIATE_TYPES.some((t) => t === n.type) && n.targetType === 'workout',
  )
  const memberJoinedNotifications = notifications.filter(
    (n) => n.type === 'member_joined' && n.targetType === 'group',
  )
  const personalBestNotifications = notifications.filter(
    (n) => n.type === 'personal_best' && n.targetType === 'workout',
  )
  const achievementNotifications = notifications.filter(
    (n) => (n.type === 'milestone' || n.type === 'comeback') && n.targetType === 'workout',
  )

  const actorIds = [
    ...new Set(
      [...workoutNotifications, ...personalBestNotifications, ...achievementNotifications]
        .map((n) => n.actorId)
        .filter((id) => id !== null),
    ),
  ]
  const [
    summaryByWorkoutId,
    sharedGroupIdByActorId,
    memberJoined,
    personalBestByKey,
    achievementByWorkoutId,
  ] = await Promise.all([
    summarizeWorkoutTargets(workoutNotifications.map((n) => n.targetId)),
    findSharedGroupIds(userId, actorIds),
    resolveMemberJoinedTargets(userId, memberJoinedNotifications),
    resolvePersonalBestTargets(personalBestNotifications),
    resolveAchievementTargets(achievementNotifications),
  ])

  const visible: {
    notification: (typeof notifications)[number]
    target: WorkoutTarget | GroupTarget | PersonalBestTarget | MilestoneTarget | ComebackTarget
  }[] = []
  for (const n of notifications) {
    if (workoutNotifications.includes(n)) {
      // 対象のworkoutが削除済み・存在しない通知は表示から除外する(#144のスコープでは通知自体の掃除は行わない)
      const summary = summaryByWorkoutId.get(n.targetId)
      if (!summary) continue
      visible.push({
        notification: n,
        target: {
          type: 'workout',
          workoutId: n.targetId,
          // いいね・コメントが見えるグループの記録フィードへ遷移するためのgroupId。
          // actorが既に全ての共通グループを退会している等でnullになることがあり、
          // その場合フロント側は自分の記録画面(/workouts/new)へフォールバックする
          groupId: (n.actorId && sharedGroupIdByActorId.get(n.actorId)) ?? null,
          ...summary,
        },
      })
    } else if (memberJoinedNotifications.includes(n)) {
      const groupName = memberJoined.groupNameById.get(n.targetId)
      if (
        groupName === undefined ||
        n.actorId === null ||
        !memberJoined.isActiveMember(n.targetId, n.actorId) ||
        !memberJoined.isActiveMember(n.targetId, userId)
      ) {
        continue
      }
      visible.push({ notification: n, target: { type: 'group', groupId: n.targetId, groupName } })
    } else if (personalBestNotifications.includes(n)) {
      // 他人の記録についての通知のため、いいね・コメントのような自分の記録画面へのフォールバックは無い。
      // 行為者と今も共通のアクティブなグループがあり、自己ベストがまだ成り立っている場合のみ表示する
      const payload = parsePersonalBestPayload(n.payload)
      const groupId = n.actorId ? sharedGroupIdByActorId.get(n.actorId) : undefined
      const summary = payload && personalBestByKey.get(`${n.targetId}:${payload.exerciseId}`)
      if (!payload || !groupId || !summary || summary.weightKg <= payload.previousBestKg) continue
      visible.push({
        notification: n,
        target: {
          type: 'personal_best',
          workoutId: n.targetId,
          groupId,
          exerciseId: payload.exerciseId,
          ...summary,
        },
      })
    } else if (achievementNotifications.includes(n)) {
      // personal_bestと同様、他人の記録についての通知のため自分の記録画面へのフォールバックは無い。
      // 行為者と今も共通のアクティブなグループがある場合のみ表示する
      const groupId = n.actorId ? sharedGroupIdByActorId.get(n.actorId) : undefined
      const summary = achievementByWorkoutId.get(n.targetId)
      if (!groupId || !summary) continue
      if (n.type === 'milestone') {
        const payload = parseMilestonePayload(n.payload)
        if (!payload) continue
        visible.push({
          notification: n,
          target: {
            type: 'milestone',
            workoutId: n.targetId,
            groupId,
            days: payload.days,
            ...summary,
          },
        })
      } else {
        visible.push({
          notification: n,
          target: { type: 'comeback', workoutId: n.targetId, groupId, ...summary },
        })
      }
    }
  }
  return visible
}

// 通知一覧を取得(既読化は行わない。既読化はPOST /notifications/readで別途行う)
notificationsRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  const visible = await findVisibleNotifications(userId)
  res.status(200).json(
    visible.map(({ notification: n, target }) => ({
      id: n.id,
      type: n.type,
      isRead: n.isRead,
      createdAt: n.createdAt,
      actor: n.actor ? { id: n.actor.id, displayName: n.actor.displayName } : null,
      target,
    })),
  )
})

// 未読件数のみを返す(②ホームのバッジ用)。一覧と同じ判定・同じ直近50件の範囲で数え、
// 一覧の未読件数と一致させる(Issue #249)
notificationsRouter.get('/unread-count', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const visible = await findVisibleNotifications(userId)
  res.status(200).json({ count: visible.filter((v) => !v.notification.isRead).length })
})

// 自分宛の未読通知を一括既読化する(通知一覧を開いたタイミングでフロントから呼ぶ想定。個別の既読トグルは設けない)。
// 一覧と同じ判定を通し、まだ表示していない通知(作成から5分未満のmember_joined等)は既読にしない(Issue #249)。
// 一覧取得からこのAPIまでの間にちょうど5分を過ぎた通知が、表示されないまま既読になるずれは許容する
notificationsRouter.post('/read', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const unreadIds = (await findVisibleNotifications(userId))
    .filter((v) => !v.notification.isRead)
    .map((v) => v.notification.id)
  if (unreadIds.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: unreadIds }, recipientId: userId },
      data: { isRead: true },
    })
  }
  res.status(204).send()
})
