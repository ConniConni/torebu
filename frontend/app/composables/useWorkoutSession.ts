interface WorkoutSetItem {
  id: string
  workoutId: string
  exerciseId: string
  setOrder: number
  weightKg: number | null
  reps: number
}

interface SessionState {
  workoutId: string | null
  performedAt: string | null
  sets: WorkoutSetItem[]
  memo: string | null
}

// ③記録作成の進行中状態(workoutId・登録済みset一覧)。④種目選択・⑦種目追加を挟んでも
// ページ間を移動するとcomposableは再生成されるため、useStateで保持して途切れないようにする
export function useWorkoutSession() {
  const session = useState<SessionState>('workout-session', () => ({
    workoutId: null,
    performedAt: null,
    sets: [],
    memo: null,
  }))
  const requestFetch = useRequestFetch()
  const { workouts, fetchWorkouts } = useWorkouts()

  // その日の記録を開始する。同じ日のworkoutが既にあれば(ホームから戻って再開した場合など)
  // 作り直さずそれを使う。
  // performedAtも比較しているのは、②ホームの記録カードから別の日のworkoutへ直接遷移できる
  // ようになった(③⑥統合ステップ4)ため。workoutIdだけを見ると、既に別の日のworkoutを開いた
  // 状態のセッションが残っていた場合にそれを誤って使い回してしまう
  async function startWorkout(performedAt: string) {
    if (session.value.workoutId && session.value.performedAt === performedAt) {
      return session.value.workoutId
    }

    if (!workouts.value) {
      await fetchWorkouts()
    }
    const existing = (workouts.value ?? []).find((w) => w.performedAt === performedAt)
    if (existing) {
      session.value = { workoutId: existing.id, performedAt, sets: [], memo: null }
      await fetchSets()
      return existing.id
    }

    // SSR時、素の$fetchだとブラウザから来たCookieが転送されずログイン判定を誤る
    // （useAuth.tsのfetchMeと同じ理由）。過去日を指定して初めてこのページを開く（＝その日の
    // workoutがまだ無い）ケースはSSRで直接POSTが走るため、ここは必ずrequestFetchを使う
    const workout = await requestFetch<{ id: string; memo: string | null }>('/api/workouts', {
      method: 'POST',
      body: { performedAt },
    })
    session.value = { workoutId: workout.id, performedAt, sets: [], memo: workout.memo }
    return workout.id
  }

  async function fetchSets() {
    if (!session.value.workoutId) return
    const workout = await requestFetch<{ sets: WorkoutSetItem[]; memo: string | null }>(
      `/api/workouts/${session.value.workoutId}`,
    )
    session.value.sets = workout.sets
    session.value.memo = workout.memo
  }

  // 空文字列を送るとメモをクリア(null)できる(backend/src/routes/workouts.ts参照)
  async function updateMemo(memo: string) {
    if (!session.value.workoutId) return
    const trimmed = memo.trim()
    const updated = await $fetch<{ memo: string | null }>(`/api/workouts/${session.value.workoutId}`, {
      method: 'PATCH',
      body: { memo: trimmed },
    })
    session.value.memo = updated.memo
  }

  async function addSet(exerciseId: string, reps: number, weightKg?: number) {
    if (!session.value.workoutId) throw new Error('workoutが開始されていません')
    const set = await $fetch<WorkoutSetItem>(`/api/workouts/${session.value.workoutId}/sets`, {
      method: 'POST',
      body: { exerciseId, reps, weightKg },
    })
    session.value.sets = [...session.value.sets, set]
    return set
  }

  async function removeSet(setId: string) {
    if (!session.value.workoutId) return
    await $fetch(`/api/workouts/${session.value.workoutId}/sets/${setId}`, { method: 'DELETE' })
    session.value.sets = session.value.sets.filter((s) => s.id !== setId)
  }

  async function updateSet(setId: string, weightKg: number | null, reps: number) {
    if (!session.value.workoutId) throw new Error('workoutが開始されていません')
    const updated = await $fetch<WorkoutSetItem>(
      `/api/workouts/${session.value.workoutId}/sets/${setId}`,
      { method: 'PATCH', body: { weightKg, reps } },
    )
    session.value.sets = session.value.sets.map((s) => (s.id === updated.id ? updated : s))
    return updated
  }

  // 記録完了。②ホームのカレンダー・記録一覧に今回の分を反映させるため一覧を再取得してから
  // セッション状態をリセットする
  async function finishWorkout() {
    await fetchWorkouts()
    session.value = { workoutId: null, performedAt: null, sets: [], memo: null }
  }

  // 記録全体の削除（⑥記録詳細のonDeleteWorkout相当）。finishWorkoutと同様、
  // ②ホーム側に反映させるため一覧を再取得してからセッション状態をリセットする
  async function deleteWorkout() {
    if (!session.value.workoutId) return
    await requestFetch(`/api/workouts/${session.value.workoutId}`, { method: 'DELETE' })
    await fetchWorkouts()
    session.value = { workoutId: null, performedAt: null, sets: [], memo: null }
  }

  return {
    session,
    startWorkout,
    fetchSets,
    addSet,
    removeSet,
    updateSet,
    updateMemo,
    finishWorkout,
    deleteWorkout,
  }
}

export type { WorkoutSetItem }
