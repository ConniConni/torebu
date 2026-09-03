import type { MuscleGroup } from '~/utils/muscleGroup'

interface Exercise {
  id: string
  name: string
  muscleGroup: MuscleGroup
  muscleDetail: string | null
  equipment: string | null
  createdBy: string | null
  useCount: number
}

interface CreateExercisePayload {
  name: string
  muscleGroup: MuscleGroup
}

// 種目マスタ一覧(公式＋自分のカスタム種目、使用回数DESC→名前順でAPI側がソート済み)。
// ④種目選択・⑦種目追加の両方から使うためページ間で共有する
export function useExercises() {
  const exercises = useState<Exercise[] | null>('exercises', () => null)
  const pending = ref(false)
  const error = ref(false)
  const requestFetch = useRequestFetch()

  async function fetchExercises() {
    pending.value = true
    error.value = false
    try {
      exercises.value = await requestFetch<Exercise[]>('/api/exercises')
    } catch {
      error.value = true
    } finally {
      pending.value = false
    }
  }

  async function createExercise(payload: CreateExercisePayload) {
    const exercise = await $fetch<Exercise>('/api/exercises', { method: 'POST', body: payload })
    // 一覧に追加した種目をその場で反映する(再取得すると使用回数の集計まで走り直すため、追記で済ませる)
    exercises.value = [...(exercises.value ?? []), exercise]
    return exercise
  }

  return { exercises, pending, error, fetchExercises, createExercise }
}

export type { Exercise }
