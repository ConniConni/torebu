import { Router } from 'express'
import { prisma } from '../prisma.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

export const adminRouter = Router()

adminRouter.use(requireAdmin)

const DAY_MS = 24 * 60 * 60 * 1000

// 記録したユーザーの人数(同じ人の複数の記録は1人と数える)。
// 「いつ記録したか」はperformedAt(ユーザーが選ぶ日付で、過去日も入れられる)ではなく作成日時で見る
async function countRecordingUsers(since: Date) {
  const rows = await prisma.workout.groupBy({
    by: ['userId'],
    where: { deletedAt: null, createdAt: { gte: since } },
  })
  return rows.length
}

// GET /admin/stats — 運営向けの集計値(Issue #401)。件数のみを返し、個々のユーザー・記録の中身は返さない。
// 「直近7日/30日」はリクエスト時点からさかのぼった期間(暦の週・月の区切りではない)
adminRouter.get('/stats', async (_req, res) => {
  const now = Date.now()
  const since7 = new Date(now - 7 * DAY_MS)
  const since30 = new Date(now - 30 * DAY_MS)

  const [
    usersTotal,
    usersLast7,
    usersLast30,
    usersViaShare,
    activeLast7,
    activeLast30,
    groupsTotal,
    workoutsTotal,
    workoutsLast7,
    reactionsTotal,
    reactionsLast7,
    commentsTotal,
    commentsLast7,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since7 } } }),
    prisma.user.count({ where: { createdAt: { gte: since30 } } }),
    prisma.user.count({ where: { signupRef: 'share' } }),
    countRecordingUsers(since7),
    countRecordingUsers(since30),
    prisma.group.count({ where: { deletedAt: null } }),
    prisma.workout.count({ where: { deletedAt: null } }),
    prisma.workout.count({ where: { deletedAt: null, createdAt: { gte: since7 } } }),
    prisma.reaction.count(),
    prisma.reaction.count({ where: { createdAt: { gte: since7 } } }),
    prisma.comment.count(),
    prisma.comment.count({ where: { createdAt: { gte: since7 } } }),
  ])

  res.json({
    users: {
      total: usersTotal,
      last7Days: usersLast7,
      last30Days: usersLast30,
      viaShare: usersViaShare,
    },
    activeUsers: { last7Days: activeLast7, last30Days: activeLast30 },
    groups: { total: groupsTotal },
    workouts: { total: workoutsTotal, last7Days: workoutsLast7 },
    reactions: { total: reactionsTotal, last7Days: reactionsLast7 },
    comments: { total: commentsTotal, last7Days: commentsLast7 },
  })
})
