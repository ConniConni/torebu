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
  sets: WorkoutSetItem[]
}

// ③記録作成の進行中状態(workoutId・登録済みset一覧)。④種目選択・⑦種目追加を挟んでも
// ページ間を移動するとcomposableは再生成されるため、useStateで保持して途切れないようにする
export function useWorkoutSession() {
  const session = useState<SessionState>('workout-session', () => ({ workoutId: null, sets: [] }))
  const requestFetch = useRequestFetch()
  const { workouts, fetchWorkouts } = useWorkouts()

  // その日の記録を開始する。同じ日のworkoutが既にあれば(ホームから戻って再開した場合など)
  // 作り直さずそれを使う
  async function startWorkout(performedAt: string) {
    if (session.value.workoutId) return session.value.workoutId

    if (!workouts.value) {
      await fetchWorkouts()
    }
    const existing = (workouts.value ?? []).find((w) => w.performedAt === performedAt)
    if (existing) {
      session.value.workoutId = existing.id
      await fetchSets()
      return existing.id
    }

    const workout = await $fetch<{ id: string }>('/api/workouts', {
      method: 'POST',
      body: { performedAt },
    })
    session.value = { workoutId: workout.id, sets: [] }
    return workout.id
  }

  async function fetchSets() {
    if (!session.value.workoutId) return
    const workout = await requestFetch<{ sets: WorkoutSetItem[] }>(
      `/api/workouts/${session.value.workoutId}`,
    )
    session.value.sets = workout.sets
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

  // 記録完了。②ホームのカレンダー・記録一覧に今回の分を反映させるため一覧を再取得してから
  // セッション状態をリセットする
  async function finishWorkout() {
    await fetchWorkouts()
    session.value = { workoutId: null, sets: [] }
  }

  return { session, startWorkout, fetchSets, addSet, removeSet, finishWorkout }
}

export type { WorkoutSetItem }
