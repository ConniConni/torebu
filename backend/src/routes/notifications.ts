import { Router } from 'express'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const notificationsRouter = Router()

// 一覧に出す件数の上限(Phase4初弾はページングを設けず、直近分のみ返す)
const LIST_LIMIT = 50

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

// 通知一覧を取得(既読化は行わない。既読化はPOST /notifications/readで別途行う)
notificationsRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  const notifications = await prisma.notification.findMany({
    where: { recipientId: userId, targetType: 'workout' },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    include: { actor: { select: { id: true, displayName: true } } },
  })

  // 対象のworkoutが削除済み・存在しない通知は表示から除外する(#144のスコープでは通知自体の掃除は行わない)
  const summaryByWorkoutId = await summarizeWorkoutTargets(notifications.map((n) => n.targetId))
  const actorIds = [...new Set(notifications.map((n) => n.actorId).filter((id) => id !== null))]
  const sharedGroupIdByActorId = await findSharedGroupIds(userId, actorIds)

  const items = notifications
    .filter((n) => summaryByWorkoutId.has(n.targetId))
    .map((n) => ({
      id: n.id,
      type: n.type,
      isRead: n.isRead,
      createdAt: n.createdAt,
      actor: n.actor ? { id: n.actor.id, displayName: n.actor.displayName } : null,
      target: {
        type: 'workout' as const,
        workoutId: n.targetId,
        // いいね・コメントが見えるグループの記録フィードへ遷移するためのgroupId。
        // actorが既に全ての共通グループを退会している等でnullになることがあり、
        // その場合フロント側は自分の記録画面(/workouts/new)へフォールバックする
        groupId: (n.actorId && sharedGroupIdByActorId.get(n.actorId)) ?? null,
        ...summaryByWorkoutId.get(n.targetId)!,
      },
    }))

  res.status(200).json(items)
})

// 未読件数のみを返す(②ホームのバッジ用。一覧を開かずに済むよう軽量に分ける)
notificationsRouter.get('/unread-count', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  const count = await prisma.notification.count({ where: { recipientId: userId, isRead: false } })
  res.status(200).json({ count })
})

// 自分宛の未読通知を一括既読化する(通知一覧を開いたタイミングでフロントから呼ぶ想定。個別の既読トグルは設けない)
notificationsRouter.post('/read', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在
  await prisma.notification.updateMany({
    where: { recipientId: userId, isRead: false },
    data: { isRead: true },
  })
  res.status(204).send()
})
