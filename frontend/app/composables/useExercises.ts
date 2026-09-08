import type { MuscleGroup } from '~/utils/muscleGroup'

interface Exercise {
  id: string
  name: string
  muscleGroup: MuscleGroup
  muscleDetail: string | null
  equipment: string | null
  createdBy: string | null
  useCount: number
  // 部位ハイライト用(Phase2、docs/muscle-highlight.md参照)。カスタム種目は常にnull/空配列
  mainMuscle: string | null
  relatedMuscles: string[]
  mainZone: string | null
  // 削除済み(ソフトデリート)のカスタム種目かどうか。nullなら未削除。
  // 削除済みでも一覧レスポンス自体には残る(過去記録の種目名解決に使うため。Issue #113)。
  // 種目選択・追加候補からはこのフィールドを見てフロント側で除外する
  deletedAt: string | null
  // 直近の実績セット(前回記録の自動反映用、Issue #116)。記録が無ければnull
  lastSet: { weightKg: number | null; reps: number } | null
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

  // カスタム種目の削除(ソフトデリート)。一覧からは消さずdeletedAtだけ立てる
  // (削除後も同じ画面内で過去記録の種目名解決に使われ続けるため。GET /exercisesと同じ方針)
  async function deleteExercise(id: string) {
    await $fetch(`/api/exercises/${id}`, { method: 'DELETE' })
    exercises.value = (exercises.value ?? []).map((e) =>
      e.id === id ? { ...e, deletedAt: new Date().toISOString() } : e,
    )
  }

  // lastSetをその場で書き換える(前回記録の自動反映、Issue #116)。`exercises`はuseStateで
  // セッション中ずっとキャッシュされ続ける(③に戻るたびの再取得はしない設計)ため、セットを
  // 保存しても放っておくとlastSetが古いまま残ってしまう。セット保存の成功直後に呼んで、
  // 次にこの種目を別の日で使うときの前回値をその場で最新化する
  function patchLastSet(exerciseId: string, lastSet: { weightKg: number | null; reps: number }) {
    exercises.value = (exercises.value ?? []).map((e) =>
      e.id === exerciseId ? { ...e, lastSet } : e,
    )
  }

  return { exercises, pending, error, fetchExercises, createExercise, deleteExercise, patchLastSet }
}

export type { Exercise }
