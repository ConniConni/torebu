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

// 期間比較（GET /stats/growth）は全期間（比較相手が無い）を受け付けない
const growthRangeSchema = z.object({
  range: z.enum(['1m', '3m']).default('1m'),
})

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
// 有酸素種目は{date, distanceKm, durationSec, paceSecPerKm, speedKmh}の形で返す(Issue #352・#364。距離・時間は無い側がnull)
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

    // 距離・時間は日ごとの合計（記録が無い側はnull。時間だけ・距離だけの日も残す）。
    // ペース・時速は「距離と時間がそろったセット」だけで出す
    // (片方しかない行は速さを定義できない。画面の行ごとの速さ表示と同じ扱い)。
    // 複数セットの日は合計時間÷合計距離の加重平均
    const byDay = new Map<
      string,
      {
        distanceKm: number | null
        durationSec: number | null
        pairedDistanceKm: number
        pairedDurationSec: number
      }
    >()
    for (const set of cardioSets) {
      const dateKey = toDateKey(set.workout.performedAt)
      const day = byDay.get(dateKey) ?? {
        distanceKm: null,
        durationSec: null,
        pairedDistanceKm: 0,
        pairedDurationSec: 0,
      }
      const distanceKm = set.distanceKm === null ? null : Number(set.distanceKm)
      if (distanceKm !== null) day.distanceKm = (day.distanceKm ?? 0) + distanceKm
      if (set.durationSec !== null) day.durationSec = (day.durationSec ?? 0) + set.durationSec
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
          distanceKm: day.distanceKm === null ? null : Math.round(day.distanceKm * 100) / 100,
          durationSec: day.durationSec,
          paceSecPerKm: hasSpeed ? Math.round(day.pairedDurationSec / day.pairedDistanceKm) : null,
          speedKmh: hasSpeed
            ? Math.round((day.pairedDistanceKm / day.pairedDurationSec) * 3600 * 10) / 10
            : null,
        }
      })
      // 距離・時間のどちらも無い日(通常は無いが、念のため)はグラフに出せる値が無いため含めない
      .filter((p) => (p.distanceKm ?? 0) > 0 || (p.durationSec ?? 0) > 0)
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

// GET /stats/exercises/:exerciseId/personal-bests (Issue #370)
// 指定した種目の自己ベスト更新の履歴を、期間を問わず全期間・新しい順で返す。
// 基準は既存の自己ベスト通知と同じ「種目ごとの最大重量」(workouts.tsのevaluatePersonalBest)。
// 自重セット(weightKg null)・回数0のセットは対象外。同じ日は最大重量の1件にまとめ(同重量なら回数が多いセット)、
// それまでの最高を「上回った」日だけ数える(同じ重量を出しただけの日は含めない)。初めての記録は previousBestKg: null。
// 公式種目以外は404。有酸素は重量の概念が無いので空配列
statsRouter.get('/exercises/:exerciseId/personal-bests', requireAuth, async (req, res) => {
  const userId = req.session.userId
  const exerciseId = req.params.exerciseId as string

  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, ...OFFICIAL_EXERCISE_FILTER },
  })
  if (!exercise) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  if (exercise.muscleGroup === 'cardio') {
    res.json([])
    return
  }

  const sets = await prisma.workoutSet.findMany({
    where: {
      exerciseId,
      weightKg: { not: null },
      reps: { gt: 0 },
      workout: { userId, deletedAt: null },
    },
    select: { weightKg: true, reps: true, workout: { select: { performedAt: true } } },
  })

  const topByDate = new Map<string, { weightKg: number; reps: number }>()
  for (const set of sets) {
    const weightKg = Number(set.weightKg)
    const reps = set.reps as number // whereでreps > 0に絞っている
    const dateKey = toDateKey(set.workout.performedAt)
    const top = topByDate.get(dateKey)
    if (!top || weightKg > top.weightKg || (weightKg === top.weightKg && reps > top.reps)) {
      topByDate.set(dateKey, { weightKg, reps })
    }
  }

  const records: { date: string; weightKg: number; reps: number; previousBestKg: number | null }[] =
    []
  let best: number | null = null
  for (const [date, top] of Array.from(topByDate.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (best === null || top.weightKg > best) {
      records.push({ date, ...top, previousBestKg: best })
      best = top.weightKg
    }
  }

  res.json(records.reverse())
})

// 伸び率(%)。0.1%単位に丸める。前が0以下なら定義できないのでnull
function growthPct(previous: number, current: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

// GET /stats/growth?range=1m|3m (Issue #366)
// 直近の期間と、その直前の同じ長さの期間を比べる。期間の切り方は/stats/volumeと同じ
// (今日を含む「今日-N日〜今日」のN+1日間。前の期間はその直前のN+1日間)。全期間は比較相手が無いので400。
// 前の期間にセットが1件も無ければ比較値は返さず`hasPrevious: false`だけ返す(トレ日数0＝記録なし)。
// - 合計負荷重量：/stats/volumeと同じ定義(公式種目・自重除外)。前期が0なら増減%はnull
// - トレ日数：セットがある日の数(frontend/app/utils/trainingDays.tsと同じ定義。種目の種類は問わない)
// - 種目別：推定1RM(日ごとではなく期間内の最大値)。今期・前期の両方に対象セット(1〜10回)がある公式種目だけ。
//   対象種目の判定は種目別推移と同じ(複合関節の種目、または設定showAllOneRmがオン)。伸び率の大きい順
statsRouter.get('/growth', requireAuth, async (req, res) => {
  const parsed = growthRangeSchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() })
    return
  }
  const userId = req.session.userId
  const windowDays = (RANGE_DAYS[parsed.data.range] as number) + 1
  const currentStart = rangeStartDate(parsed.data.range) as Date
  const previousStart = new Date(currentStart)
  previousStart.setDate(previousStart.getDate() - windowDays)
  const previousEnd = new Date(currentStart)
  previousEnd.setDate(previousEnd.getDate() - 1)

  const period = {
    range: parsed.data.range,
    currentStart: toDateKey(currentStart),
    currentEnd: toDateKey(new Date()),
    previousStart: toDateKey(previousStart),
    previousEnd: toDateKey(previousEnd),
  }

  const [sets, user] = await Promise.all([
    prisma.workoutSet.findMany({
      where: { workout: { userId, deletedAt: null, performedAt: { gte: previousStart } } },
      select: {
        weightKg: true,
        reps: true,
        exercise: { select: { id: true, name: true, createdBy: true } },
        workout: { select: { performedAt: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { showAllOneRm: true } }),
  ])
  const showAllOneRm = user?.showAllOneRm ?? false

  const empty = () => ({
    volumeKg: 0,
    days: new Set<string>(),
    // 種目ID → { name, 期間内の推定1RMの最大値 }
    oneRm: new Map<string, { name: string; kg: number }>(),
  })
  const current = empty()
  const previous = empty()
  for (const set of sets) {
    const bucket = set.workout.performedAt >= currentStart ? current : previous
    bucket.days.add(toDateKey(set.workout.performedAt))
    if (set.weightKg === null || set.exercise.createdBy !== null) continue
    const weightKg = Number(set.weightKg)
    bucket.volumeKg += weightKg * (set.reps ?? 0)
    if (!isOneRmTarget(set.exercise) && !showAllOneRm) continue
    if (oneRepMaxLevel(set.reps) !== 'normal') continue
    const estimated = estimateOneRepMaxKg(weightKg, set.reps)
    if (estimated === null) continue
    const existing = bucket.oneRm.get(set.exercise.id)
    if (!existing || estimated > existing.kg) {
      bucket.oneRm.set(set.exercise.id, { name: set.exercise.name, kg: estimated })
    }
  }

  if (previous.days.size === 0) {
    res.json({ ...period, hasPrevious: false })
    return
  }

  const exercises = Array.from(current.oneRm.entries())
    .flatMap(([exerciseId, cur]) => {
      const prev = previous.oneRm.get(exerciseId)
      if (!prev) return []
      return [
        {
          exerciseId,
          name: cur.name,
          previousKg: roundToTenth(prev.kg),
          currentKg: roundToTenth(cur.kg),
          growthPct: growthPct(prev.kg, cur.kg),
        },
      ]
    })
    .sort(
      (a, b) =>
        (b.growthPct ?? -Infinity) - (a.growthPct ?? -Infinity) || a.name.localeCompare(b.name),
    )

  res.json({
    ...period,
    hasPrevious: true,
    current: { volumeKg: current.volumeKg, trainingDays: current.days.size },
    previous: { volumeKg: previous.volumeKg, trainingDays: previous.days.size },
    volumeChangePct: growthPct(previous.volumeKg, current.volumeKg),
    trainingDaysDiff: current.days.size - previous.days.size,
    exercises,
  })
})
