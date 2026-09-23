interface WorkoutSetItem {
  id: string
  workoutId: string
  exerciseId: string
  setOrder: number
  weightKg: number | null
  reps: number
}

// 種目カード単位の並び順(Issue #228)。ルーティンのRoutineExerciseと同じ役割
interface WorkoutExerciseItem {
  id: string
  workoutId: string
  exerciseId: string
  sortOrder: number
}

interface SessionState {
  workoutId: string | null
  performedAt: string | null
  sets: WorkoutSetItem[]
  exercises: WorkoutExerciseItem[]
  memo: string | null
}

// ③記録作成の進行中状態(workoutId・登録済みset一覧)。④種目選択・⑦種目追加を挟んでも
// ページ間を移動するとcomposableは再生成されるため、useStateで保持して途切れないようにする
export function useWorkoutSession() {
  const session = useState<SessionState>('workout-session', () => ({
    workoutId: null,
    performedAt: null,
    sets: [],
    exercises: [],
    memo: null,
  }))
  const requestFetch = useRequestFetch()
  const { workouts, fetchWorkouts } = useWorkouts()
  const { patchLastSet } = useExercises()

  // その日の記録を開始する。同じ日のworkoutが既にあれば(ホームから戻って再開した場合など)
  // 作り直さずそれを使う。
  // performedAtも比較しているのは、②ホームの記録カードから別の日のworkoutへ直接遷移できる
  // ようになった(③⑥統合ステップ4)ため。workoutIdだけを見ると、既に別の日のworkoutを開いた
  // 状態のセッションが残っていた場合にそれを誤って使い回してしまう
  //
  // 該当日のworkoutがまだ無い場合、ここではPOSTしない（workoutId: nullのまま返す）。
  // 開いただけ・種目を選んだだけで何も保存せずに離れると空のworkout行が②ホームに残ってしまう
  // 問題があったため、実際に何か保存するタイミング(ensureWorkout)まで作成を遅らせる
  // （docs/backlog.md「UI改善アイデア」参照）
  async function startWorkout(performedAt: string) {
    if (session.value.performedAt === performedAt) {
      return session.value.workoutId
    }

    if (!workouts.value) {
      await fetchWorkouts()
    }
    const existing = (workouts.value ?? []).find((w) => w.performedAt === performedAt)
    if (existing) {
      session.value = { workoutId: existing.id, performedAt, sets: [], exercises: [], memo: null }
      await fetchSets()
      return existing.id
    }

    session.value = { workoutId: null, performedAt, sets: [], exercises: [], memo: null }
    return null
  }

  // その日のworkoutがまだ無ければここで初めて作成する。addSet/updateMemoなど、
  // 実際に何かを保存する操作の直前でだけ呼ぶ
  async function ensureWorkout() {
    if (session.value.workoutId) return session.value.workoutId
    if (!session.value.performedAt) throw new Error('記録日が未設定です')

    // SSR時、素の$fetchだとブラウザから来たCookieが転送されずログイン判定を誤る
    // （useAuth.tsのfetchMeと同じ理由）。過去日を指定して初めてこのページで保存する
    // （＝その日のworkoutがまだ無い）ケースはSSRで直接POSTが走りうるため、必ずrequestFetchを使う
    const workout = await requestFetch<{ id: string; memo: string | null }>('/api/workouts', {
      method: 'POST',
      body: { performedAt: session.value.performedAt },
    })
    session.value.workoutId = workout.id
    session.value.memo = workout.memo
    return workout.id
  }

  async function fetchSets() {
    if (!session.value.workoutId) return
    const workout = await requestFetch<{
      sets: WorkoutSetItem[]
      exercises: WorkoutExerciseItem[]
      memo: string | null
    }>(`/api/workouts/${session.value.workoutId}`)
    session.value.sets = workout.sets
    session.value.exercises = workout.exercises
    session.value.memo = workout.memo
  }

  // 空文字列を送るとメモをクリア(null)できる(backend/src/routes/workouts.ts参照)。
  // ただしworkoutがまだ無い状態で空メモを保存しても意味が無い（空のworkoutを作るだけになる）ため、
  // その場合は何もしない
  async function updateMemo(memo: string) {
    const trimmed = memo.trim()
    if (!session.value.workoutId && !trimmed) return

    const workoutId = await ensureWorkout()
    const updated = await $fetch<{ memo: string | null }>(`/api/workouts/${workoutId}`, {
      method: 'PATCH',
      body: { memo: trimmed },
    })
    session.value.memo = updated.memo
  }

  async function addSet(exerciseId: string, reps: number, weightKg?: number) {
    const workoutId = await ensureWorkout()
    const { workoutExercise, ...set } = await $fetch<
      WorkoutSetItem & { workoutExercise: WorkoutExerciseItem }
    >(`/api/workouts/${workoutId}/sets`, {
      method: 'POST',
      body: { exerciseId, reps, weightKg },
    })
    session.value.sets = [...session.value.sets, set]
    // この種目の1set目の場合のみ、種目カード(WorkoutExercise)がサーバー側で新しく作られている。
    // 既存カードへの追加(2set目以降)ではidが変わらないため、無条件pushだと重複してしまう(Issue #228)
    if (!session.value.exercises.some((e) => e.id === workoutExercise.id)) {
      session.value.exercises = [...session.value.exercises, workoutExercise]
    }
    // 前回記録の自動反映(Issue #116)用キャッシュをその場で最新化する。詳細はuseExercises.ts参照
    patchLastSet(exerciseId, { weightKg: set.weightKg, reps: set.reps })
    return set
  }

  async function removeSet(setId: string) {
    if (!session.value.workoutId) return
    await $fetch(`/api/workouts/${session.value.workoutId}/sets/${setId}`, { method: 'DELETE' })
    // 削除すると同じ種目の残りのsetOrderがサーバー側で1から連番に詰め直されるため、
    // ローカルでの単純なfilterではなく再取得して反映する
    await fetchSets()
  }

  async function updateSet(setId: string, weightKg: number | null, reps: number) {
    if (!session.value.workoutId) throw new Error('workoutが開始されていません')
    const updated = await $fetch<WorkoutSetItem>(
      `/api/workouts/${session.value.workoutId}/sets/${setId}`,
      { method: 'PATCH', body: { weightKg, reps } },
    )
    session.value.sets = session.value.sets.map((s) => (s.id === updated.id ? updated : s))
    // 前回記録の自動反映(Issue #116)用キャッシュをその場で最新化する（詳細はuseExercises.ts参照）。
    // ただし編集したのがこのworkout内でその種目の最後(setOrder最大)のセットのときだけ更新する。
    // 例えば3セット中1セット目だけ編集した場合、lastSetは引き続き3セット目の値を指すべきなので、
    // 1セット目の編集でlastSetを上書きしてしまうと誤った値になる
    const sameExerciseSetOrders = session.value.sets
      .filter((s) => s.exerciseId === updated.exerciseId)
      .map((s) => s.setOrder)
    if (updated.setOrder === Math.max(...sameExerciseSetOrders)) {
      patchLastSet(updated.exerciseId, { weightKg: updated.weightKg, reps: updated.reps })
    }
    return updated
  }

  // 記録完了。②ホームのカレンダー・記録一覧に今回の分を反映させるため一覧を再取得してからホームへ
  // 遷移する。何も保存していなければ(workoutId未作成)、反映すべきものが無いのでAPIは呼ばない。
  // セッション状態のリセットはここではせず、呼び出し元(③記録作成ページ)がonUnmounted等
  // 「実際にページが画面から外れたタイミング」で行う(resetSession参照)。
  // 以前はここで`await navigateTo('/')`の直後にリセットしていたが、navigateTo()のPromiseは
  // Nuxtの<Suspense>がホーム側の非同期setup(fetchWorkouts等の複数API呼び出し)を解決し終える
  // 前に解決することがあり、その場合まだ③記録作成ページがSuspense配下で表示され続けている間に
  // session(sets/exercises)が空になり、結局ホームへの切り替わり前に記録が一瞬消えて見える
  // 不具合が再現していた(Issue #231の1回目の修正では直りきらなかった原因)
  async function finishWorkout() {
    if (session.value.workoutId) {
      await fetchWorkouts()
    }
    await navigateTo('/')
  }

  // ③記録作成ページが実際にアンマウントされたタイミングでのみ呼ぶ(onUnmounted等)。
  // navigateTo()完了後ではなく「アンマウント」を待つのは上記finishWorkoutのコメント参照
  function resetSession() {
    session.value = { workoutId: null, performedAt: null, sets: [], exercises: [], memo: null }
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
    resetSession,
  }
}

export type { WorkoutSetItem, WorkoutExerciseItem }
