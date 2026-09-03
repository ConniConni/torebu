interface Workout {
  id: string
  performedAt: string // YYYY-MM-DD（backend/src/routes/workouts.tsのserializeWorkout参照）
  memo: string | null
  createdAt: string
  updatedAt: string
}

// 自分のworkout一覧。今はAPI側に日付範囲の絞り込みが無いため全件取得し、
// カレンダー側で表示中の月に絞り込む（件数が増えた場合の絞り込みは別途検討）
export function useWorkouts() {
  const workouts = useState<Workout[] | null>('workouts', () => null)
  const pending = ref(false)
  const error = ref(false)
  // SSR時、素の$fetchだとブラウザから来たCookieが転送されずログイン判定を誤る
  // （useAuth.tsのfetchMeと同じ理由。frontend/app/composables/useAuth.ts参照）
  const requestFetch = useRequestFetch()

  async function fetchWorkouts() {
    pending.value = true
    error.value = false
    try {
      workouts.value = await requestFetch<Workout[]>('/api/workouts')
    } catch {
      error.value = true
    } finally {
      pending.value = false
    }
  }

  return { workouts, pending, error, fetchWorkouts }
}

export type { Workout }
