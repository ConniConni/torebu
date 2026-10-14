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

// 有酸素種目の推移（Issue #352）。速さは距離・時間がそろったセットがある日だけ（無ければnull）
interface CardioHistoryPoint {
  date: string
  distanceKm: number
  paceSecPerKm: number | null
  speedKmh: number | null
}

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

  return { fetchVolume, fetchExerciseHistory }
}

export type { VolumePoint, ExerciseHistoryPoint, CardioHistoryPoint }
