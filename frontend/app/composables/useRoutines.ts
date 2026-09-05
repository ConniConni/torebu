interface Routine {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

// 目安セット1件(重量・回数)。weightKgはnull=自重。未設定の種目は空配列で返る(backend/src/routes/routines.ts参照)
interface TargetSet {
  weightKg: number | null
  reps: number
}

interface RoutineExerciseItem {
  id: string
  routineId: string
  exerciseId: string
  sortOrder: number
  targetSets: TargetSet[]
  exercise: { id: string; name: string; muscleGroup: MuscleGroup }
}

interface RoutineDetail extends Routine {
  exercises: RoutineExerciseItem[]
}

// ⑤ルーティン一覧。一覧取得・新規作成・名前編集・削除
export function useRoutines() {
  const routines = useState<Routine[] | null>('routines', () => null)
  const pending = ref(false)
  const error = ref(false)
  // SSR時、素の$fetchだとブラウザから来たCookieが転送されずログイン判定を誤る
  // （useAuth.tsのfetchMeと同じ理由。frontend/app/composables/useAuth.ts参照）
  const requestFetch = useRequestFetch()

  async function fetchRoutines() {
    pending.value = true
    error.value = false
    try {
      routines.value = await requestFetch<Routine[]>('/api/routines')
    } catch {
      error.value = true
    } finally {
      pending.value = false
    }
  }

  async function createRoutine(name: string) {
    const routine = await $fetch<Routine>('/api/routines', { method: 'POST', body: { name } })
    // 一覧はcreatedAt降順のため先頭に追加すれば取得し直さなくても順序が保たれる
    routines.value = [routine, ...(routines.value ?? [])]
    return routine
  }

  async function renameRoutine(id: string, name: string) {
    const updated = await $fetch<Routine>(`/api/routines/${id}`, { method: 'PATCH', body: { name } })
    routines.value = (routines.value ?? []).map((r) => (r.id === id ? updated : r))
    return updated
  }

  async function deleteRoutine(id: string) {
    await $fetch(`/api/routines/${id}`, { method: 'DELETE' })
    routines.value = (routines.value ?? []).filter((r) => r.id !== id)
  }

  // ③記録作成でルーティンを適用する際、種目一式（名前・部位込み）を取得するために使う
  async function fetchRoutineDetail(id: string) {
    return await $fetch<RoutineDetail>(`/api/routines/${id}`)
  }

  return {
    routines,
    pending,
    error,
    fetchRoutines,
    createRoutine,
    renameRoutine,
    deleteRoutine,
    fetchRoutineDetail,
  }
}

export type { Routine, RoutineDetail, RoutineExerciseItem, TargetSet }
