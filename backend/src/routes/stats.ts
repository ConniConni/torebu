import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const statsRouter = Router()

// 集計対象は公式種目のみ(createdBy IS NULL)。カスタム種目は記録・ルーティンには使えるが
// 集計の対象外(2026-09-08決定、docs/backlog.md参照)。将来ニーズが出たら再検討する
const OFFICIAL_EXERCISE_FILTER = { createdBy: null }

const RANGE_DAYS: Record<string, number | null> = {
  '1m': 30,
  '3m': 90,
  all: null,
}

const rangeSchema = z.object({
  range: z.enum(['1m', '3m', 'all']).default('3m'),
})

// rangeから「performedAt >= このtimestamp」の下限を計算する。allはundefined(下限なし)
function rangeStartDate(range: keyof typeof RANGE_DAYS): Date | undefined {
  const days = RANGE_DAYS[range]
  if (days === null) return undefined
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - days)
  return start
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// GET /stats/volume?range=1m|3m|all
// 日別の合計負荷重量(Σ weightKg * reps)を返す。
// 自重種目のセット(weightKg IS NULL)は重量を定義できないため集計から完全に除外する
// (2026-09-08決定)。データが無い日は結果に含めない(0埋めはしない)
statsRouter.get('/volume', requireAuth, async (req, res) => {
  const parsed = rangeSchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() })
    return
  }
  const userId = req.session.userId
  const startDate = rangeStartDate(parsed.data.range)

  const sets = await prisma.workoutSet.findMany({
    where: {
      weightKg: { not: null },
      workout: {
        userId,
        deletedAt: null,
        ...(startDate ? { performedAt: { gte: startDate } } : {}),
      },
      exercise: OFFICIAL_EXERCISE_FILTER,
    },
    select: { weightKg: true, reps: true, workout: { select: { performedAt: true } } },
  })

  const volumeByDate = new Map<string, number>()
  for (const set of sets) {
    // whereで絞っているためweightKgはnullではないが、型上はDecimal | nullのまま
    const weightKg = Number(set.weightKg)
    const dateKey = toDateKey(set.workout.performedAt)
    volumeByDate.set(dateKey, (volumeByDate.get(dateKey) ?? 0) + weightKg * set.reps)
  }

  const result = Array.from(volumeByDate.entries())
    .map(([date, volumeKg]) => ({ date, volumeKg }))
    .sort((a, b) => a.date.localeCompare(b.date))

  res.json(result)
})

// GET /stats/exercises/:exerciseId/history?range=1m|3m|all
// 指定した種目の、実施日ごとの最大重量・合計負荷重量の推移を返す。
// /stats/volumeと同じ理由で自重セットは除外する。公式種目以外(カスタム種目・存在しない種目)は404
statsRouter.get('/exercises/:exerciseId/history', requireAuth, async (req, res) => {
  const parsed = rangeSchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() })
    return
  }
  const userId = req.session.userId
  const exerciseId = req.params.exerciseId as string
  const startDate = rangeStartDate(parsed.data.range)

  // 集計対象は公式種目のみ。カスタム種目・存在しないIDは「存在自体を隠す」方針(§4-1)に合わせ404
  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, ...OFFICIAL_EXERCISE_FILTER },
  })
  if (!exercise) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const sets = await prisma.workoutSet.findMany({
    where: {
      exerciseId,
      weightKg: { not: null },
      workout: {
        userId,
        deletedAt: null,
        ...(startDate ? { performedAt: { gte: startDate } } : {}),
      },
    },
    select: { weightKg: true, reps: true, workout: { select: { performedAt: true } } },
  })

  const byDate = new Map<string, { maxWeightKg: number; volumeKg: number }>()
  for (const set of sets) {
    const weightKg = Number(set.weightKg)
    const dateKey = toDateKey(set.workout.performedAt)
    const existing = byDate.get(dateKey)
    const volumeKg = weightKg * set.reps
    if (existing) {
      existing.maxWeightKg = Math.max(existing.maxWeightKg, weightKg)
      existing.volumeKg += volumeKg
    } else {
      byDate.set(dateKey, { maxWeightKg: weightKg, volumeKg })
    }
  }

  const result = Array.from(byDate.entries())
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date))

  res.json(result)
})
