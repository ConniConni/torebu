import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const ownerEmail = 'stats-owner-test@example.com'
const otherEmail = 'stats-other-test@example.com'
const testPassword = 'password123'

let ownerId: string
let otherId: string
let exerciseId: string
let customExerciseId: string
let runId: string
let bikeId: string

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  const owner = await prisma.user.create({
    data: { email: ownerEmail, passwordHash, displayName: '集計テストユーザー' },
  })
  const other = await prisma.user.create({
    data: { email: otherEmail, passwordHash, displayName: '集計テスト別ユーザー' },
  })
  ownerId = owner.id
  otherId = other.id

  const exercise = await prisma.exercise.create({
    data: { name: 'ベンチプレス', muscleGroup: 'chest' },
  })
  exerciseId = exercise.id
  const customExercise = await prisma.exercise.create({
    data: { name: '自作種目', muscleGroup: 'legs', createdBy: ownerId },
  })
  customExerciseId = customExercise.id
  const run = await prisma.exercise.create({
    data: { name: '集計テスト用ラン', muscleGroup: 'cardio', speedUnit: 'pace' },
  })
  const bike = await prisma.exercise.create({
    data: { name: '集計テスト用バイク', muscleGroup: 'cardio', speedUnit: 'kmh' },
  })
  runId = run.id
  bikeId = bike.id
})

afterEach(async () => {
  await prisma.workoutSet.deleteMany({
    where: { workout: { userId: { in: [ownerId, otherId] } } },
  })
  await prisma.workout.deleteMany({ where: { userId: { in: [ownerId, otherId] } } })
  await prisma.exercise.deleteMany({
    where: { id: { in: [exerciseId, customExerciseId, runId, bikeId] } },
  })
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } })
})

async function loginAsOwner() {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email: ownerEmail, password: testPassword })
  return agent
}

async function createWorkout(
  userId: string,
  overrides: { performedAt?: Date; deletedAt?: Date } = {},
) {
  return prisma.workout.create({
    data: {
      userId,
      performedAt: overrides.performedAt ?? new Date(),
      deletedAt: overrides.deletedAt,
    },
  })
}

describe('GET /stats/volume', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).get('/stats/volume')

    expect(res.status).toBe(401)
  })

  it('自分の、重量ありのセットのみ日別に合計する', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 60 },
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 2, reps: 8, weightKg: 60 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ date: '2026-09-01', volumeKg: 60 * 10 + 60 * 8 }])
  })

  it('自重セット(weightKgがnull)は集計から除外する', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 15 }, // weightKg省略=自重
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('カスタム種目のセットは集計から除外する', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: {
        workoutId: workout.id,
        exerciseId: customExerciseId,
        setOrder: 1,
        reps: 10,
        weightKg: 40,
      },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('ソフトデリート済みworkoutのセットは集計から除外する', async () => {
    const workout = await createWorkout(ownerId, {
      performedAt: new Date('2026-09-01'),
      deletedAt: new Date(),
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 40 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('他人のセットは集計に含まれない', async () => {
    const otherWorkout = await createWorkout(otherId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: otherWorkout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 40 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('rangeで指定した期間より前の記録は含まれない', async () => {
    const old = await createWorkout(ownerId, { performedAt: new Date('2000-01-01') })
    await prisma.workoutSet.create({
      data: { workoutId: old.id, exerciseId, setOrder: 1, reps: 10, weightKg: 40 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=1m')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('不正なrangeは400を返す', async () => {
    const agent = await loginAsOwner()
    const res = await agent.get('/stats/volume?range=invalid')

    expect(res.status).toBe(400)
  })
})

describe('GET /stats/exercises/:exerciseId/history', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).get(`/stats/exercises/${exerciseId}/history`)

    expect(res.status).toBe(401)
  })

  it('カスタム種目のIDを指定すると404を返す', async () => {
    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${customExerciseId}/history`)

    expect(res.status).toBe(404)
  })

  it('存在しない種目IDを指定すると404を返す', async () => {
    const agent = await loginAsOwner()
    const res = await agent.get('/stats/exercises/00000000-0000-0000-0000-000000000000/history')

    expect(res.status).toBe(404)
  })

  it('日ごとの最大重量・合計負荷重量を返す', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 60 },
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 2, reps: 8, weightKg: 65 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      {
        date: '2026-09-01',
        maxWeightKg: 65,
        volumeKg: 60 * 10 + 65 * 8,
        estimated1RmKg: 78,
        setCount: 2,
      },
    ])
  })

  it('推定1RMは同じ日の対象セットの最大値(0.1kg単位)になる', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 60 }, // 75.0
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 2, reps: 6, weightKg: 65 }, // 74.75
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 3, reps: 15, weightKg: 40 }, // 15回以上は対象外
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].estimated1RmKg).toBe(75)
  })

  it('15回以上のセットだけの日は推定1RMがnullになる(日自体は残る)', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 15, weightKg: 40 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { date: '2026-09-01', maxWeightKg: 40, volumeKg: 600, estimated1RmKg: null, setCount: 1 },
    ])
  })

  it('セット数は日ごとの重量ありセットの数で、13回以上も数え、自重は数えない', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 60 },
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 2, reps: 15, weightKg: 40 },
    })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 3, reps: 12 }, // 自重
    })
    const otherWorkout = await createWorkout(otherId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: otherWorkout.id, exerciseId, setOrder: 1, reps: 5, weightKg: 80 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].setCount).toBe(2)
  })

  it('推定1RMは0.1kg単位に丸める(65kg×6回は74.75→74.8)', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 6, weightKg: 65 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.body[0].estimated1RmKg).toBe(74.8)
  })

  it('統計の推定1RMは10回までのセットだけで計算し、11〜14回の参考値は含めない(Issue #362)', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 12, weightKg: 50 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.body).toHaveLength(1)
    expect(res.body[0].estimated1RmKg).toBeNull()
  })

  it('対象外の種目(単関節)は推定1RMがnull。設定(showAllOneRm)をオンにすると値が出る(Issue #362)', async () => {
    const lateral = await prisma.exercise.create({
      data: { name: 'ダンベルサイドレイズ', muscleGroup: 'shoulders' },
    })
    try {
      const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
      await prisma.workoutSet.create({
        data: {
          workoutId: workout.id,
          exerciseId: lateral.id,
          setOrder: 1,
          reps: 10,
          weightKg: 10,
        },
      })

      const agent = await loginAsOwner()
      const off = await agent.get(`/stats/exercises/${lateral.id}/history?range=all`)
      await agent.patch('/auth/me/settings').send({ showAllOneRm: true })
      const on = await agent.get(`/stats/exercises/${lateral.id}/history?range=all`)

      expect(off.body[0].estimated1RmKg).toBeNull()
      expect(on.body[0].estimated1RmKg).toBe(12.5)
    } finally {
      await prisma.workoutSet.deleteMany({ where: { exerciseId: lateral.id } })
      await prisma.exercise.delete({ where: { id: lateral.id } })
    }
  })

  it('他人の記録は推定1RMに混ざらない', async () => {
    const otherWorkout = await createWorkout(otherId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: otherWorkout.id, exerciseId, setOrder: 1, reps: 1, weightKg: 200 },
    })
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 1, weightKg: 100 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].estimated1RmKg).toBe(100)
  })

  it('自重セットは除外する', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId, setOrder: 1, reps: 12 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe('GET /stats/exercises/:exerciseId/history（有酸素、Issue #352）', () => {
  it('日ごとの距離合計と、距離・時間がそろったセットの加重平均ペース・時速を返す', async () => {
    const workout = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    // 5km/30:00 と 5km/25:00 → 合計10km・55分 → 330秒/km、約10.9km/h
    await prisma.workoutSet.create({
      data: {
        workoutId: workout.id,
        exerciseId: runId,
        setOrder: 1,
        distanceKm: 5,
        durationSec: 1800,
      },
    })
    await prisma.workoutSet.create({
      data: {
        workoutId: workout.id,
        exerciseId: runId,
        setOrder: 2,
        distanceKm: 5,
        durationSec: 1500,
      },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${runId}/history?range=all`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { date: '2026-09-01', distanceKm: 10, durationSec: 3300, paceSecPerKm: 330, speedKmh: 10.9 },
    ])
  })

  it('距離だけの日は時間がnull、時間だけの日は距離がnullで、どちらも速さはnull（Issue #364）', async () => {
    const w1 = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    await prisma.workoutSet.create({
      data: { workoutId: w1.id, exerciseId: bikeId, setOrder: 1, distanceKm: 20.5 },
    })
    const w2 = await createWorkout(ownerId, { performedAt: new Date('2026-09-02') })
    await prisma.workoutSet.create({
      data: { workoutId: w2.id, exerciseId: bikeId, setOrder: 1, durationSec: 1800 },
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${bikeId}/history?range=all`)

    expect(res.body).toEqual([
      {
        date: '2026-09-01',
        distanceKm: 20.5,
        durationSec: null,
        paceSecPerKm: null,
        speedKmh: null,
      },
      {
        date: '2026-09-02',
        distanceKm: null,
        durationSec: 1800,
        paceSecPerKm: null,
        speedKmh: null,
      },
    ])
  })

  it('他人の記録・削除済みの記録は含めない', async () => {
    const mine = await createWorkout(ownerId, { performedAt: new Date('2026-09-01') })
    const deleted = await createWorkout(ownerId, {
      performedAt: new Date('2026-09-02'),
      deletedAt: new Date(),
    })
    const others = await createWorkout(otherId, { performedAt: new Date('2026-09-03') })
    for (const w of [mine, deleted, others]) {
      await prisma.workoutSet.create({
        data: { workoutId: w.id, exerciseId: runId, setOrder: 1, distanceKm: 5, durationSec: 1800 },
      })
    }

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${runId}/history?range=all`)

    expect(res.body.map((p: { date: string }) => p.date)).toEqual(['2026-09-01'])
  })
})

// 今日から数えてn日前の日付（その日のUTC 0時。performedAtは日付列のため、実行環境のタイムゾーンに
// 関わらず「ローカルの暦日のn日前」を指すようにしてある。期間の境界のテストに使う）
function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

describe('GET /stats/growth（期間比較、Issue #366）', () => {
  async function addSet(
    userId: string,
    exId: string,
    performedAt: Date,
    reps: number,
    weightKg: number | null,
  ) {
    const workout = await createWorkout(userId, { performedAt })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId: exId, setOrder: 1, reps, weightKg },
    })
  }

  it('未ログインなら401を返す', async () => {
    const res = await request(app).get('/stats/growth')

    expect(res.status).toBe(401)
  })

  it('全期間・不正なrangeは400を返す（全期間は比較相手が無い）', async () => {
    const agent = await loginAsOwner()

    expect((await agent.get('/stats/growth?range=all')).status).toBe(400)
    expect((await agent.get('/stats/growth?range=invalid')).status).toBe(400)
  })

  it('前の期間に記録が無ければ、hasPrevious: falseと期間の日付だけを返す', async () => {
    await addSet(ownerId, exerciseId, daysAgo(5), 10, 60)

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/growth?range=1m')

    expect(res.status).toBe(200)
    expect(res.body.hasPrevious).toBe(false)
    expect(res.body.current).toBeUndefined()
    expect(res.body.exercises).toBeUndefined()
    expect(res.body.previousStart).toBeTruthy()
  })

  it('今期と前期の合計負荷重量・トレ日数・推定1RMを比べる', async () => {
    // 前期: 60kg×10(推定75.0kg、600kg)。今期: 65kg×6(390kg)＋70kg×10(700kg、推定87.5)
    await addSet(ownerId, exerciseId, daysAgo(45), 10, 60)
    await addSet(ownerId, exerciseId, daysAgo(5), 6, 65)
    await addSet(ownerId, exerciseId, daysAgo(3), 10, 70)

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/growth?range=1m')

    expect(res.status).toBe(200)
    expect(res.body.hasPrevious).toBe(true)
    expect(res.body.previous).toEqual({ volumeKg: 600, trainingDays: 1 })
    expect(res.body.current).toEqual({ volumeKg: 65 * 6 + 70 * 10, trainingDays: 2 })
    expect(res.body.volumeChangePct).toBe(81.7) // (1090-600)/600 = 81.67
    expect(res.body.trainingDaysDiff).toBe(1)
    // 推定1RM: 前期 60×(40+10)/40=75.0、今期 70×(40+10)/40=87.5 → +16.7%
    expect(res.body.exercises).toEqual([
      {
        exerciseId,
        name: 'ベンチプレス',
        previousKg: 75,
        currentKg: 87.5,
        growthPct: 16.7,
      },
    ])
  })

  // 端ぎりぎりの日（-30/-31/-61/-62日）は、performedAtが日付列でDBへの比較値が日付に切り詰められるため
  // 実行環境のタイムゾーン（本番はUTC、開発機は日本時間）で1日ずれる。/stats/volumeと同じ挙動なので、
  // ここでは端から2日以上離れた日で「今期・前期・どちらでもない」の分類を確かめる
  it('今期（-28日）・前期（-33日）に分かれ、それより前（-70日）はどちらにも入らない（1m）', async () => {
    await addSet(ownerId, exerciseId, daysAgo(28), 10, 10) // 今期 100kg
    await addSet(ownerId, exerciseId, daysAgo(33), 10, 20) // 前期 200kg
    await addSet(ownerId, exerciseId, daysAgo(70), 10, 30) // 対象外

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/growth?range=1m')

    expect(res.body.current.volumeKg).toBe(100)
    expect(res.body.previous.volumeKg).toBe(200)
  })

  it('3mは90日ずつで比べる', async () => {
    await addSet(ownerId, exerciseId, daysAgo(60), 10, 10) // 今期
    await addSet(ownerId, exerciseId, daysAgo(120), 10, 20) // 前期

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/growth?range=3m')

    expect(res.body.current.volumeKg).toBe(100)
    expect(res.body.previous.volumeKg).toBe(200)
  })

  it('前期の合計負荷重量が0（自重のみ）でも比較は出し、増減%はnullになる', async () => {
    await addSet(ownerId, exerciseId, daysAgo(45), 10, null)
    await addSet(ownerId, exerciseId, daysAgo(5), 10, 60)

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/growth?range=1m')

    expect(res.body.hasPrevious).toBe(true)
    expect(res.body.previous).toEqual({ volumeKg: 0, trainingDays: 1 })
    expect(res.body.volumeChangePct).toBeNull()
    expect(res.body.exercises).toEqual([])
  })

  it('種目別は、両方の期間に10回までのセットがある種目だけを伸び率の大きい順に返す', async () => {
    const squat = await prisma.exercise.create({
      data: { name: 'バーベルスクワット', muscleGroup: 'legs' },
    })
    const deadlift = await prisma.exercise.create({
      data: { name: 'デッドリフト', muscleGroup: 'back' },
    })
    try {
      await addSet(ownerId, exerciseId, daysAgo(45), 10, 60) // ベンチ 75.0
      await addSet(ownerId, exerciseId, daysAgo(5), 10, 62) // 77.5 → +3.3%
      await addSet(ownerId, squat.id, daysAgo(45), 5, 100) // 112.5
      await addSet(ownerId, squat.id, daysAgo(5), 5, 110) // 123.75→123.8 → +10.0%
      await addSet(ownerId, deadlift.id, daysAgo(5), 5, 120) // 今期だけ→出さない

      const agent = await loginAsOwner()
      const res = await agent.get('/stats/growth?range=1m')

      expect(res.body.exercises.map((e: { name: string }) => e.name)).toEqual([
        'バーベルスクワット',
        'ベンチプレス',
      ])
      expect(res.body.exercises[0].growthPct).toBe(10)
    } finally {
      await prisma.workoutSet.deleteMany({ where: { exerciseId: { in: [squat.id, deadlift.id] } } })
      await prisma.exercise.deleteMany({ where: { id: { in: [squat.id, deadlift.id] } } })
    }
  })

  it('11回以上のセットだけの種目は種目別に出さない（合計負荷重量には入る）', async () => {
    await addSet(ownerId, exerciseId, daysAgo(45), 12, 50)
    await addSet(ownerId, exerciseId, daysAgo(5), 12, 55)

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/growth?range=1m')

    expect(res.body.exercises).toEqual([])
    expect(res.body.current.volumeKg).toBe(55 * 12)
  })

  it('対象外の種目（単関節）は、設定showAllOneRmをオンにしたときだけ種目別に出る', async () => {
    const lateral = await prisma.exercise.create({
      data: { name: 'ダンベルサイドレイズ', muscleGroup: 'shoulders' },
    })
    try {
      await addSet(ownerId, lateral.id, daysAgo(45), 10, 10)
      await addSet(ownerId, lateral.id, daysAgo(5), 10, 12)

      const agent = await loginAsOwner()
      const off = await agent.get('/stats/growth?range=1m')
      await agent.patch('/auth/me/settings').send({ showAllOneRm: true })
      const on = await agent.get('/stats/growth?range=1m')

      expect(off.body.exercises).toEqual([])
      expect(on.body.exercises).toHaveLength(1)
      expect(on.body.exercises[0].growthPct).toBe(20)
    } finally {
      await prisma.workoutSet.deleteMany({ where: { exerciseId: lateral.id } })
      await prisma.exercise.delete({ where: { id: lateral.id } })
    }
  })

  it('他人の記録・削除済みの記録・カスタム種目は含めない', async () => {
    await addSet(ownerId, exerciseId, daysAgo(45), 10, 60)
    await addSet(ownerId, exerciseId, daysAgo(5), 10, 62)
    await addSet(otherId, exerciseId, daysAgo(5), 10, 200) // 他人
    const deleted = await createWorkout(ownerId, {
      performedAt: daysAgo(4),
      deletedAt: new Date(),
    })
    await prisma.workoutSet.create({
      data: { workoutId: deleted.id, exerciseId, setOrder: 1, reps: 10, weightKg: 300 },
    })
    await addSet(ownerId, customExerciseId, daysAgo(5), 10, 500) // カスタム種目

    const agent = await loginAsOwner()
    const res = await agent.get('/stats/growth?range=1m')

    // 他人・削除済み・カスタム種目を除くと、今期は62kg×10の1日だけ
    expect(res.body.current).toEqual({ volumeKg: 620, trainingDays: 1 })
    expect(res.body.exercises).toHaveLength(1)
  })
})

describe('GET /stats/exercises/:exerciseId/personal-bests（自己ベスト履歴、Issue #370）', () => {
  async function addSet(
    userId: string,
    exId: string,
    performedAt: Date,
    reps: number,
    weightKg: number | null,
    opts: { deletedAt?: Date } = {},
  ) {
    const workout = await createWorkout(userId, { performedAt, deletedAt: opts.deletedAt })
    await prisma.workoutSet.create({
      data: { workoutId: workout.id, exerciseId: exId, setOrder: 1, reps, weightKg },
    })
  }

  it('未ログインなら401を返す', async () => {
    const res = await request(app).get(`/stats/exercises/${exerciseId}/personal-bests`)

    expect(res.status).toBe(401)
  })

  it('カスタム種目・存在しない種目は404を返す', async () => {
    const agent = await loginAsOwner()

    expect((await agent.get(`/stats/exercises/${customExerciseId}/personal-bests`)).status).toBe(
      404,
    )
    expect(
      (await agent.get('/stats/exercises/00000000-0000-0000-0000-000000000000/personal-bests'))
        .status,
    ).toBe(404)
  })

  it('有酸素は空配列を返す', async () => {
    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${runId}/personal-bests`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('記録が無ければ空配列を返す', async () => {
    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/personal-bests`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('上回った日だけを新しい順に返し、初めての記録はpreviousBestKgがnull（期間に関係なく全期間）', async () => {
    await addSet(ownerId, exerciseId, daysAgo(200), 8, 55)
    await addSet(ownerId, exerciseId, daysAgo(100), 10, 60)
    await addSet(ownerId, exerciseId, daysAgo(50), 8, 57.5) // 下回る
    await addSet(ownerId, exerciseId, daysAgo(20), 8, 60) // 同じ重量は更新に数えない
    await addSet(ownerId, exerciseId, daysAgo(5), 5, 65)

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/personal-bests`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { date: toKey(daysAgo(5)), weightKg: 65, reps: 5, previousBestKg: 60 },
      { date: toKey(daysAgo(100)), weightKg: 60, reps: 10, previousBestKg: 55 },
      { date: toKey(daysAgo(200)), weightKg: 55, reps: 8, previousBestKg: null },
    ])
  })

  it('同じ日に複数セットあれば最大重量の1件にまとめ、同重量なら回数が多いセットを返す', async () => {
    const day = daysAgo(10)
    const workout = await createWorkout(ownerId, { performedAt: day })
    await prisma.workoutSet.createMany({
      data: [
        { workoutId: workout.id, exerciseId, setOrder: 1, reps: 10, weightKg: 50 },
        { workoutId: workout.id, exerciseId, setOrder: 2, reps: 3, weightKg: 62.5 },
        { workoutId: workout.id, exerciseId, setOrder: 3, reps: 6, weightKg: 62.5 },
      ],
    })

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/personal-bests`)

    expect(res.body).toEqual([{ date: toKey(day), weightKg: 62.5, reps: 6, previousBestKg: null }])
  })

  it('自重セット・回数0のセットは対象にもベストにも数えない', async () => {
    await addSet(ownerId, exerciseId, daysAgo(30), 15, null)
    await addSet(ownerId, exerciseId, daysAgo(20), 0, 100) // 失敗した挑戦
    await addSet(ownerId, exerciseId, daysAgo(10), 5, 60)

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/personal-bests`)

    expect(res.body).toEqual([
      { date: toKey(daysAgo(10)), weightKg: 60, reps: 5, previousBestKg: null },
    ])
  })

  it('他人の記録・削除済みの記録・他の種目は混ざらない', async () => {
    await addSet(ownerId, exerciseId, daysAgo(30), 5, 50)
    await addSet(otherId, exerciseId, daysAgo(20), 5, 120) // 他人
    await addSet(ownerId, exerciseId, daysAgo(10), 5, 90, { deletedAt: new Date() }) // 削除済み
    await addSet(ownerId, customExerciseId, daysAgo(5), 5, 200) // 別の種目

    const agent = await loginAsOwner()
    const res = await agent.get(`/stats/exercises/${exerciseId}/personal-bests`)

    expect(res.body).toEqual([
      { date: toKey(daysAgo(30)), weightKg: 50, reps: 5, previousBestKg: null },
    ])
  })
})
