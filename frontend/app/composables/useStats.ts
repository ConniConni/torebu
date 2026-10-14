import type { GrowthExercise } from '~/utils/growth'

export type StatsRange = '1m' | '3m' | 'all'

interface VolumePoint {
  date: string
  volumeKg: number
}

interface ExerciseHistoryPoint {
  date: string
  maxWeightKg: number
  volumeKg: number
  // 推定1RM(Epley式、1〜12回のセットのみ)。対象セットが無い日はnull
  estimated1RmKg: number | null
  // その日の重量ありセットの数
  setCount: number
}

// 有酸素種目の推移（Issue #352）。距離・時間は記録が無い側がnull（Issue #364）。
// 速さは距離・時間がそろったセットがある日だけ（無ければnull）
interface CardioHistoryPoint {
  date: string
  distanceKm: number | null
  durationSec: number | null
  paceSecPerKm: number | null
  speedKmh: number | null
}

// 期間比較（Issue #366、`GET /stats/growth`）。前の期間に記録が無いときはhasPrevious: falseだけ
export type GrowthRange = '1m' | '3m'

interface GrowthPeriod {
  range: GrowthRange
  currentStart: string
  currentEnd: string
  previousStart: string
  previousEnd: string
}

type GrowthResponse =
  | (GrowthPeriod & { hasPrevious: false })
  | (GrowthPeriod & {
      hasPrevious: true
      current: { volumeKg: number; trainingDays: number }
      previous: { volumeKg: number; trainingDays: number }
      volumeChangePct: number | null
      trainingDaysDiff: number
      exercises: GrowthExercise[]
    })

// 統計画面（/stats、Phase3-C）専用のAPI呼び出し。exercises/workoutsと違い、rangeや選択種目が
// 変わるたびに取り直す一覧のため、useExercises/useWorkoutsのようなuseStateでの
// セッション中キャッシュはしない（画面を離れたら破棄してよい）
export function useStats() {
  const requestFetch = useRequestFetch()

  async function fetchVolume(range: StatsRange) {
    return requestFetch<VolumePoint[]>('/api/stats/volume', { query: { range } })
  }

  async function fetchExerciseHistory(exerciseId: string, range: StatsRange) {
    return requestFetch<ExerciseHistoryPoint[] | CardioHistoryPoint[]>(
      `/api/stats/exercises/${exerciseId}/history`,
      {
        query: { range },
      },
    )
  }

  async function fetchGrowth(range: GrowthRange) {
    return requestFetch<GrowthResponse>('/api/stats/growth', { query: { range } })
  }

  return { fetchVolume, fetchExerciseHistory, fetchGrowth }
}

export type { VolumePoint, ExerciseHistoryPoint, CardioHistoryPoint, GrowthResponse }
