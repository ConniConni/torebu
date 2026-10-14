import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { estimateOneRepMaxKg, oneRepMaxLevel, roundToTenth } from '../lib/oneRepMax.js'
import { isOneRmTarget } from '../lib/oneRepMaxTarget.js'

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
    volumeByDate.set(dateKey, (volumeByDate.get(dateKey) ?? 0) + weightKg * (set.reps ?? 0))
  }

  const result = Array.from(volumeByDate.entries())
    .map(([date, volumeKg]) => ({ date, volumeKg }))
    .sort((a, b) => a.date.localeCompare(b.date))

  res.json(result)
})

// GET /stats/exercises/:exerciseId/history?range=1m|3m|all
// 指定した種目の、実施日ごとの最大重量・合計負荷重量・推定1RM(オコナー式、複合関節種目の1〜10回のセットのみ)・セット数の推移を返す。
// /stats/volumeと同じ理由で自重セットは除外する。公式種目以外(カスタム種目・存在しない種目)は404。
// 有酸素種目は{date, distanceKm, paceSecPerKm, speedKmh}の形で返す(Issue #352)
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

  // 有酸素は重量×回数ではなく距離・時間で返す(Issue #352)。返却の形が筋トレと異なる
  if (exercise.muscleGroup === 'cardio') {
    const cardioSets = await prisma.workoutSet.findMany({
      where: {
        exerciseId,
        workout: {
          userId,
          deletedAt: null,
          ...(startDate ? { performedAt: { gte: startDate } } : {}),
        },
      },
      select: {
        distanceKm: true,
        durationSec: true,
        workout: { select: { performedAt: true } },
      },
    })

    // 距離は日ごとの合計。ペース・時速は「距離と時間がそろったセット」だけで出す
    // (片方しかない行は速さを定義できない。画面の行ごとの速さ表示と同じ扱い)。
    // 複数セットの日は合計時間÷合計距離の加重平均
    const byDay = new Map<
      string,
      { distanceKm: number; pairedDistanceKm: number; pairedDurationSec: number }
    >()
    for (const set of cardioSets) {
      const dateKey = toDateKey(set.workout.performedAt)
      const day = byDay.get(dateKey) ?? { distanceKm: 0, pairedDistanceKm: 0, pairedDurationSec: 0 }
      const distanceKm = set.distanceKm === null ? null : Number(set.distanceKm)
      if (distanceKm !== null) day.distanceKm += distanceKm
      if (distanceKm !== null && set.durationSec !== null) {
        day.pairedDistanceKm += distanceKm
        day.pairedDurationSec += set.durationSec
      }
      byDay.set(dateKey, day)
    }

    const cardioResult = Array.from(byDay.entries())
      .map(([date, day]) => {
        const hasSpeed = day.pairedDistanceKm > 0 && day.pairedDurationSec > 0
        return {
          date,
          distanceKm: Math.round(day.distanceKm * 100) / 100,
          paceSecPerKm: hasSpeed ? Math.round(day.pairedDurationSec / day.pairedDistanceKm) : null,
          speedKmh: hasSpeed
            ? Math.round((day.pairedDistanceKm / day.pairedDurationSec) * 3600 * 10) / 10
            : null,
        }
      })
      // 距離が1つも無い日(時間だけ記録)はグラフに出せる値が無いため含めない
      .filter((p) => p.distanceKm > 0)
      .sort((a, b) => a.date.localeCompare(b.date))

    res.json(cardioResult)
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

  // 推定1RMを出すのは複合関節の公式種目だけ。対象外の種目は、設定(users.showAllOneRm)がオンのときだけ出す
  // (Issue #362)。統計に入れるのは通常の回数帯(1〜10回)だけで、11〜14回の参考値は含めない
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { showAllOneRm: true },
  })
  const showEstimate = isOneRmTarget(exercise) || (user?.showAllOneRm ?? false)

  const byDate = new Map<
    string,
    { maxWeightKg: number; volumeKg: number; estimated1RmKg: number | null; setCount: number }
  >()
  for (const set of sets) {
    const weightKg = Number(set.weightKg)
    const dateKey = toDateKey(set.workout.performedAt)
    const existing = byDate.get(dateKey)
    const volumeKg = weightKg * (set.reps ?? 0)
    const estimated =
      showEstimate && oneRepMaxLevel(set.reps) === 'normal'
        ? estimateOneRepMaxKg(weightKg, set.reps)
        : null
    if (existing) {
      existing.maxWeightKg = Math.max(existing.maxWeightKg, weightKg)
      existing.volumeKg += volumeKg
      existing.setCount += 1
      if (estimated !== null) {
        existing.estimated1RmKg = Math.max(existing.estimated1RmKg ?? 0, estimated)
      }
    } else {
      byDate.set(dateKey, {
        maxWeightKg: weightKg,
        volumeKg,
        estimated1RmKg: estimated,
        setCount: 1,
      })
    }
  }

  // 推定1RMは日ごとの最大値(0.1kg単位)。対象セットが無い日はnull(グラフに点を出さない)
  const result = Array.from(byDate.entries())
    .map(([date, values]) => ({
      date,
      ...values,
      estimated1RmKg: values.estimated1RmKg === null ? null : roundToTenth(values.estimated1RmKg),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  res.json(result)
})
