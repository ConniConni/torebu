export type StatsRange = '1m' | '3m' | 'all'

interface VolumePoint {
  date: string
  volumeKg: number
}

interface ExerciseHistoryPoint {
  date: string
  maxWeightKg: number
  volumeKg: number
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
    return requestFetch<ExerciseHistoryPoint[]>(`/api/stats/exercises/${exerciseId}/history`, {
      query: { range },
    })
  }

  return { fetchVolume, fetchExerciseHistory }
}

export type { VolumePoint, ExerciseHistoryPoint }
