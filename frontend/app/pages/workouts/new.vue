<script setup lang="ts">
// ③ 記録作成。指定日(省略時は今日)のworkoutを開始し、種目ごとにセット(重量・回数)を
// 積み上げていく本体画面
import draggable from 'vuedraggable'

definePageMeta({ middleware: 'auth' })

const { exercises, fetchExercises } = useExercises()
if (!exercises.value) {
  await fetchExercises()
}

const {
  session,
  startWorkout,
  fetchSets,
  addSet,
  removeSet,
  updateSet,
  updateMemo,
  finishWorkout,
  resetSession,
} = useWorkoutSession()

// ?date=YYYY-MM-DDで任意の日付のworkoutを開けるようにする（省略時は今日）。
// startWorkout側は既に「同じ日付のworkoutがあれば再利用する」ロジックを持っているため、
// ここでは開く日付を解決するだけでよい
const route = useRoute()
const today = todayLocalDateString()
const targetDate = resolveTargetDate(route.query.date, today)
const previousWorkoutId = session.value.workoutId
await startWorkout(targetDate)
// ②ホームの記録カードから別の日のworkoutへ直接遷移した場合、入力待ちの種目(pendingExercises)は
// 前の日のworkoutに紐づくものなので持ち越さない
const switchedWorkout = previousWorkoutId !== null && previousWorkoutId !== session.value.workoutId

// メモは他のセット操作と同じく即APIへ反映する設計に合わせ、明示的な保存ボタンは持たず
// blur（フォーカスが外れたタイミング）で自動保存する。値が変わっていなければAPIは呼ばない。
// 「ホームへ戻る」への遷移はページ離脱を伴うため、保存中のPromiseを待たずに遷移すると
// 直前の入力が失われうる。そのため進行中の保存をpendingMemoSaveで追跡し、
// 遷移前に必ず待ち合わせる（onLeaveWorkout参照）
const memoInput = ref(session.value.memo ?? '')
const memoSaving = ref(false)
const memoError = ref('')
let pendingMemoSave: Promise<void> | null = null

function saveMemoIfChanged() {
  const trimmed = memoInput.value.trim()
  const current = (session.value.memo ?? '').trim()
  if (trimmed === current) return Promise.resolve()

  memoSaving.value = true
  memoError.value = ''
  const promise = updateMemo(memoInput.value)
    .catch(() => {
      memoError.value = 'メモの保存に失敗しました。時間をおいて再度お試しください'
    })
    .finally(() => {
      memoSaving.value = false
      pendingMemoSave = null
    })
  pendingMemoSave = promise
  return promise
}

function onMemoBlur() {
  saveMemoIfChanged()
}

// ④種目選択・⑦種目追加から戻ってきた直後は、選ばれた種目の1セット目をデフォルト値で
// 即追加する（下のonAddSet参照）。ここでは値を捕まえて保持するだけにし、実際の追加は
// 必要なstate・関数が揃った後(スクリプト末尾)で行う
const pickedExerciseId = usePickedExerciseId()
const initialPickedExerciseId = switchedWorkout ? null : pickedExerciseId.value
pickedExerciseId.value = null

const pendingExercises = usePendingExercises()
if (switchedWorkout) {
  pendingExercises.value = []
}

function exerciseName(exerciseId: string) {
  return exercises.value?.find((e) => e.id === exerciseId)?.name ?? '(不明な種目)'
}

// 種目カードの並びはsession.exercises(WorkoutExercise.sortOrder順)を正とする(Issue #228)。
// このworkoutで一度もセットが無くなった種目のカードはサーバー側に残り続ける設計のため
// (useWorkoutSession.ts参照)、ここでセットが1件以上ある種目だけに絞り込んで表示する
const groupedSets = computed(() => {
  const byExercise = new Map<string, typeof session.value.sets>()
  for (const set of session.value.sets) {
    byExercise.set(set.exerciseId, [...(byExercise.get(set.exerciseId) ?? []), set])
  }
  return session.value.exercises
    .filter((e) => byExercise.has(e.exerciseId))
    .map((e) => ({
      exerciseId: e.exerciseId,
      name: exerciseName(e.exerciseId),
      sets: [...byExercise.get(e.exerciseId)!].sort((a, b) => a.setOrder - b.setOrder),
    }))
})

function groupFor(exerciseId: string) {
  return groupedSets.value.find((g) => g.exerciseId === exerciseId)
}

// vuedraggableの並び替え終了後、変化した行だけsortOrderをPATCHで反映する
// (見た目上のindex(1始まり)をそのまま新しいsortOrderとして使う。ルーティン画面のonDragEndと同じ方針)
const exerciseOrderError = ref('')
async function onExerciseDragEnd() {
  const workoutId = session.value.workoutId
  if (!workoutId) return
  exerciseOrderError.value = ''
  const updates = groupedSets.value
    .map((g, index) => ({ exerciseId: g.exerciseId, sortOrder: index + 1 }))
    .flatMap(({ exerciseId, sortOrder }) => {
      const item = session.value.exercises.find((e) => e.exerciseId === exerciseId)
      return item && item.sortOrder !== sortOrder ? [{ item, sortOrder }] : []
    })

  try {
    await Promise.all(
      updates.map(({ item, sortOrder }) =>
        $fetch(`/api/workouts/${workoutId}/exercises/${item.id}`, {
          method: 'PATCH',
          body: { sortOrder },
        }),
      ),
    )
    for (const { item, sortOrder } of updates) {
      item.sortOrder = sortOrder
    }
  } catch {
    exerciseOrderError.value = '並び替えの保存に失敗しました。時間をおいて再度お試しください'
    await fetchSets()
  }
}

// ⑤ルーティンから種目一式を展開する機能（Issue13→Issue #76で「即登録＋手直し」方式に変更）。
// 目安セット（targetSets）が設定されている種目は、その場でworkout_setsとして即登録する
// （修正が必要な分だけ既存のセット編集UIで手直ししてもらう想定。docs/backlog.md参照）。
// targetSetsが無い（未設定）種目は、従来どおり「セット入力がまだの種目」として積んでおくだけの
// 一時的なキュー（このページのローカル状態）に入れ、タップされたらonAddSetで1セット目を追加する
const { routines, fetchRoutines, fetchRoutineDetail } = useRoutines()
const showRoutinePicker = ref(false)
const routinePickerPending = ref(false)
const routineApplying = ref(false)
const routineApplyError = ref('')
const routineApplyNotice = ref('')

// 既にこのworkoutに乗っている（セット入力済み or 入力待ちの）種目ID。
// ルーティン適用時、ここに含まれる種目は重複として除外する
const takenExerciseIds = computed(() => {
  const ids = new Set(groupedSets.value.map((g) => g.exerciseId))
  for (const p of pendingExercises.value) ids.add(p.exerciseId)
  return ids
})

async function onOpenRoutinePicker() {
  showRoutinePicker.value = true
  routineApplyError.value = ''
  routineApplyNotice.value = ''
  if (!routines.value) {
    routinePickerPending.value = true
    try {
      await fetchRoutines()
    } finally {
      routinePickerPending.value = false
    }
  }
}

function onCloseRoutinePicker() {
  showRoutinePicker.value = false
  // 「0件追加」の通知（132行目）はピッカーを閉じずに出す想定のため、
  // ユーザーが手動で閉じたらここでクリアする。一部除外の通知（139行目）は
  // 適用成功と同時にピッカーが閉じるため影響しない
  routineApplyNotice.value = ''
}

async function onApplyRoutine(routineId: string) {
  routineApplyError.value = ''
  routineApplyNotice.value = ''
  routineApplying.value = true
  try {
    const detail = await fetchRoutineDetail(routineId)
    const newExercises = detail.exercises.filter((e) => !takenExerciseIds.value.has(e.exerciseId))

    // 全種目が重複除外された場合、無反応に見えないよう理由を表示する（Issue #80）。
    // ピッカーは閉じず、別のルーティンを選び直せるようにしておく
    if (newExercises.length === 0) {
      routineApplyNotice.value = '追加できる種目がありませんでした（すべて記録済みか入力中です）'
      return
    }

    // 一部の種目だけが重複除外された場合も、無言でフィルタされないよう件数を通知する（Issue #84）。
    // こちらは適用自体は成功しているのでピッカーは閉じるが、通知は本体側に残す
    // （ピッカーの外にある routineApplyNotice の表示箇所を参照）
    const excludedCount = detail.exercises.length - newExercises.length
    if (excludedCount > 0) {
      routineApplyNotice.value = `${newExercises.length}件を追加しました（${excludedCount}件は記録済みのため除外）`
    }

    // 目安セットが1つでもある種目は即登録、無い種目は従来どおり入力待ちに積む。
    // 同じ種目内の複数セットはsetOrderをサーバーが「既存の最大+1」で採番するため、
    // Promise.allではなく1件ずつawaitして順番どおりに登録する
    const newPendingItems: PendingExercise[] = []
    for (const e of newExercises) {
      if (e.targetSets.length === 0) {
        newPendingItems.push({ exerciseId: e.exerciseId, name: e.exercise.name })
        continue
      }
      for (const target of e.targetSets) {
        const { set, personalBest, achievements } = await addSet(
          e.exerciseId,
          target.reps,
          target.weightKg ?? undefined,
        )
        applyPersonalBest(set, personalBest)
        applyAchievements(achievements)
      }
    }
    pendingExercises.value = [...pendingExercises.value, ...newPendingItems]
    showRoutinePicker.value = false
  } catch {
    routineApplyError.value = 'ルーティンの適用に失敗しました。時間をおいて再度お試しください'
  } finally {
    routineApplying.value = false
  }
}

// --- 記録済みセットの値編集（⑤ルーティンの目安セット編集と同じ、常時入力欄＋blur自動保存） ---
// 「編集」ボタンで入力モードに切り替えるトグル方式は廃止し、⑤側の方式に統一した（Issue #95）。
// セットごとに入力中の値をsetIdをキーに保持する。既に値がある場合は上書きしない
// （他のセット追加・ルーティン適用のたびに入力中の値が巻き戻るのを防ぐため）
// weightはtype="number"のv-modelがVue 3.4以降で有効な数値をNumberとして保持するため
// string | numberで持つ（空欄=自重のときのみstringの''のまま）
const setInputs = reactive<Record<string, { weight: string | number; reps: string | number }>>({})
const setSaving = reactive<Record<string, boolean>>({})
const setErrors = reactive<Record<string, string>>({})
// 保存中のPromiseをsetIdごとに追跡する（onAddSetのデフォルト値決定用、Issue #116）。
// blur保存は非同期のため、blur直後に「＋セット追加」を押すと、まだsession.value.setsに
// 反映されていない編集前の値をデフォルトに使ってしまうレースが起きうる。updateMemoの
// pendingMemoSaveと同じ「待ち合わせる」方式で防ぐ。値そのもの(Promise)は追跡できればよく
// 表示に使わないためreactiveにしない
const pendingSetSaves = new Map<string, Promise<void>>()

// セット削除は他の削除操作と同じ2段階確認に揃える（backlog.md「削除確認フローの不統一」、Issue #261）
const confirmingSetDeleteId = ref<string | null>(null)
const setDeleteErrors = reactive<Record<string, string>>({})
const setDeleting = reactive<Record<string, boolean>>({})

async function onDeleteSet(setId: string) {
  setDeleting[setId] = true
  setDeleteErrors[setId] = ''
  try {
    await removeSet(setId)
    confirmingSetDeleteId.value = null
  } catch {
    setDeleteErrors[setId] = '削除に失敗しました。時間をおいて再度お試しください'
  } finally {
    setDeleting[setId] = false
  }
}

// --- 自己ベスト更新のその場の表示（Issue #253） ---
// 本人には通知を出さず、保存API（セット追加・重量の編集）の応答で返った達成内容を種目カード内に表示する。
// このページのローカル状態のため、画面を離れて戻ると消える（前回の表示を持ち越さない）。
// 種目ごとに直近の達成1件だけを持つ
const personalBests = reactive(new Map<string, PersonalBest & { setId: string }>())

function applyPersonalBest(set: WorkoutSetItem, personalBest: PersonalBest | null) {
  if (personalBest) {
    personalBests.set(set.exerciseId, { ...personalBest, setId: set.id })
    return
  }
  // 達成したセット自体の重量を変えて自己ベストでなくなった場合は、表示を取り下げる
  // （回数だけの編集では重量が変わらないため残る）
  const current = personalBests.get(set.exerciseId)
  if (current?.setId === set.id && current.weightKg !== set.weightKg) {
    personalBests.delete(set.exerciseId)
  }
}

// 達成したセットが削除された（記録ごと消えた場合も含む）ときは出さない
function personalBestFor(exerciseId: string) {
  const personalBest = personalBests.get(exerciseId)
  if (!personalBest || !session.value.sets.some((s) => s.id === personalBest.setId)) return null
  return personalBest
}

// --- 通算の節目（C1）・久しぶりの復帰（C2）のその場の表示（Issue #255） ---
// 自己ベストと違い種目単位ではなくworkout（この日の記録）単位の達成のため、種目カードの中ではなく
// ページ上部にまとめて表示する。personalBestsと同じくこのページのローカル状態のため、画面を
// 離れて戻ると消える
const achievement = ref<Achievements | null>(null)

function applyAchievements(achievements: Achievements) {
  if (achievements.milestoneDays !== null || achievements.comeback) {
    achievement.value = achievements
  }
}

// この日の記録自体が消えた（セット全削除でworkoutがソフトデリートされた等）場合は表示を取り下げる
watch(
  () => session.value.workoutId,
  (workoutId) => {
    if (!workoutId) achievement.value = null
  },
)

function ensureSetInput(set: { id: string; weightKg: number | null; reps: number }) {
  if (setInputs[set.id]) return
  setInputs[set.id] = {
    weight: set.weightKg === null ? '' : String(set.weightKg),
    reps: String(set.reps),
  }
}

// 初回読み込み・セット追加・ルーティン適用のいずれでもsession.value.setsが更新されるたびに
// 走らせ、新しく増えたセット分の入力欄を初期化する
watch(
  () => session.value.sets,
  (sets) => {
    for (const set of sets) ensureSetInput(set)
  },
  { immediate: true },
)

// 「保存」ボタンは持たず、重量・回数の入力欄からblurするたびに自動保存する（メモと同じ方針）。
// 値が不正な間（回数が空・0以下等）は保存をスキップする。
// Vue 3.4以降、type="number"のv-modelは有効な数値が入るとStringではなくNumberとして
// 保持されるため（自重で空欄のときはStringのまま）、trim()の前にString()で揃える
// 同じセットに対するblur保存が短時間に連続すると（例：重量欄→回数欄と続けてblurする）、
// 2つのPATCHがほぼ同時に飛び、レスポンスが送信順と逆に返ってくることがある。
// 素朴にそれぞれのthenでsession.value.sets/lastSetキャッシュを更新すると、後から返ってきた方が
// 「新しい値」として上書きしてしまい、実際は先勝ちしたはずの古い値が残ってしまう
// （updateSet自体は毎回サーバーの最新状態を返すので個々の呼び出しは正しいが、順序が問題になる）。
// これを避けるため、同じsetIdへの保存は直前の保存が終わるまで待ってから始める(直列化する)
async function onSetFieldBlur(setId: string) {
  const previous = pendingSetSaves.get(setId)
  if (previous) await previous

  const inputs = setInputs[setId]
  if (!inputs) return
  const reps = Number(inputs.reps)
  if (!Number.isInteger(reps) || reps <= 0) return
  const weightRaw = String(inputs.weight).trim()
  const weightKg = weightRaw ? Number(weightRaw) : null

  setSaving[setId] = true
  setErrors[setId] = ''
  const promise = updateSet(setId, weightKg, reps)
    .then(({ set, personalBest }) => applyPersonalBest(set, personalBest))
    .catch(() => {
      setErrors[setId] = 'セットの更新に失敗しました。時間をおいて再度お試しください'
    })
    .finally(() => {
      setSaving[setId] = false
      pendingSetSaves.delete(setId)
    })
  pendingSetSaves.set(setId, promise)
  return promise
}

// --- セット追加（Issue #91：自動保存方式への統一） ---
// ⑤ルーティン編集の「＋目安セットを追加」と同じ方針：デフォルト値でその場でAPIに登録し、
// 常時表示の入力欄でその場で重量・回数を手直ししてもらう
const DEFAULT_SET_REPS = 10
const addSetError = ref('')

// デフォルト値の優先順位（Issue #116、Phase3-A「前回記録の自動反映」）：
// 1. 今回のworkout内でこの種目に既に記録済みのセットがあれば、その最後（＝直近）のセット
//    （⑤の目安セットが即登録された分も含む。「同じ種目のセットを続けて積む」操作なので、
//    古い前回記録より今回すでに入力した値の方が参考になる）
// 2. 前回実際に記録したセット（`GET /exercises`の`lastSet`）
// 3. どちらも無ければ従来どおり自重・10回
function defaultSetValuesFor(exerciseId: string): { reps: number; weightKg?: number } {
  const existing = groupedSets.value.find((g) => g.exerciseId === exerciseId)
  const lastInThisWorkout = existing?.sets.at(-1)
  if (lastInThisWorkout) {
    return { reps: lastInThisWorkout.reps, weightKg: lastInThisWorkout.weightKg ?? undefined }
  }

  const lastSet = exercises.value?.find((e) => e.id === exerciseId)?.lastSet
  if (lastSet) {
    return { reps: lastSet.reps, weightKg: lastSet.weightKg ?? undefined }
  }

  return { reps: DEFAULT_SET_REPS }
}

// invalid_exercise(削除済み種目への新規追加など)は「時間をおいて再度お試しください」と
// 案内しても解決しない恒久的な失敗のため、他の失敗(通信エラー等)と分けて案内する(Issue #113)
function addSetErrorMessage(error: unknown): string {
  const code = (error as { data?: { error?: string } })?.data?.error
  if (code === 'invalid_exercise') {
    return 'この種目は削除されているため、新しくセットを追加できません'
  }
  return 'セットの記録に失敗しました。時間をおいて再度お試しください'
}

async function onAddSet(exerciseId: string) {
  addSetError.value = ''
  // この種目のセットがまさにblur保存中の場合、その保存を待ってからデフォルト値を決める
  // （defaultSetValuesForはPromiseではなく確定済みのsession.value.setsを見るため。上記参照）
  const existing = groupedSets.value.find((g) => g.exerciseId === exerciseId)
  if (existing) {
    await Promise.all(
      existing.sets.flatMap((s) => {
        const pending = pendingSetSaves.get(s.id)
        return pending ? [pending] : []
      }),
    )
  }
  try {
    const { reps, weightKg } = defaultSetValuesFor(exerciseId)
    const { set, personalBest, achievements } = await addSet(exerciseId, reps, weightKg)
    ensureSetInput(set)
    applyPersonalBest(set, personalBest)
    applyAchievements(achievements)
  } catch (error) {
    addSetError.value = addSetErrorMessage(error)
  }
}

// 入力待ちの種目をタップしたら、キューから外して1セット目を即追加する
async function onStartPendingExercise(exerciseId: string) {
  pendingExercises.value = pendingExercises.value.filter((p) => p.exerciseId !== exerciseId)
  await onAddSet(exerciseId)
}

// ④種目選択・⑦種目追加から戻ってきた直後、選ばれた種目の1セット目を即追加する
// （必要なstate・関数が揃った後であるここで行う。initialPickedExerciseIdはスクリプト冒頭参照）
if (initialPickedExerciseId) {
  await onAddSet(initialPickedExerciseId)
}

// ③記録作成を離れる操作（旧「今日の記録を完了」「ホームへ戻る」）。セット記録・削除は
// 既に即APIへ反映されているため、finishWorkout自体は「②ホームのキャッシュを再取得してから
// ホームへ遷移する」だけの処理（workoutが未作成なら再取得もしない）。
// 「今日の記録を完了」だけがこの再取得をしていて、「ホームへ戻る」は素のリンクだったため
// 遷移直後の②ホームに今回の変更が反映されないことがあった。実質同じ操作なので1つに統合する。
// メモの自動保存がblur待ちで進行中の場合があるため、遷移前に必ず待ち合わせる。
// セットの重量・回数も同様：フィールドのblurは離脱ボタンのclickより先に発火する
// （ブラウザのイベント順序上、blur→clickの順になる）ため、この時点でpendingSetSavesには
// 直前の編集の保存Promiseが積まれているはずだが、それを待たずに遷移すると
// 直前の入力が保存されないまま失われる(気づいたことをその場で修正。Issue #116の動作確認中に発覚)
//
// セッション状態(session)のリセットはここでは行わず、下のonUnmounted(このページが実際に
// アンマウントされるタイミング)で行う。isLeavingWorkoutはその橋渡し用のフラグで、
// 「④種目選択へ一時的に離れる(onGoToExercisePicker)」等、resetSession()してはいけない
// アンマウントと区別するために立てる（詳細はuseWorkoutSession.tsのfinishWorkoutのコメント参照）
const isLeavingWorkout = ref(false)

async function onLeaveWorkout() {
  await (pendingMemoSave ?? saveMemoIfChanged())
  await Promise.all(pendingSetSaves.values())
  isLeavingWorkout.value = true
  await finishWorkout()
}

onUnmounted(() => {
  if (!isLeavingWorkout.value) return
  resetSession()
  // 入力待ちの種目もworkout単位の状態のため、離脱と合わせてリセットする
  // （そうしないと次回の記録開始時に前回分の入力待ち種目が残ってしまう）。
  // sessionと同じ理由でアンマウント後に行う（pendingExercisesもこのページの表示に使っている）
  pendingExercises.value = []
})

// 「＋種目を追加」も④への画面遷移(離脱)を伴うため、onLeaveWorkoutと同じ理由で
// 保存中のセット編集を待ってから遷移する
async function onGoToExercisePicker() {
  await Promise.all(pendingSetSaves.values())
  await navigateTo({
    path: '/workouts/exercises',
    query: { returnTo: `/workouts/new?date=${targetDate}` },
  })
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-surface px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <button type="button" class="text-sm text-gray-500 dark:text-muted" @click="onLeaveWorkout">
          ← ホームに戻る
        </button>
        <h1 class="text-base font-semibold text-gray-900 dark:text-ink">{{ targetDate }}の記録</h1>
      </div>

      <section class="rounded-lg bg-white dark:bg-panel p-4 shadow">
        <label class="flex flex-col gap-1 text-sm text-gray-700 dark:text-ink">
          メモ
          <textarea
            v-model="memoInput"
            rows="2"
            maxlength="500"
            placeholder="今日の体調・気づいたことなど"
            class="rounded border border-gray-300 dark:border-border-dark px-2 py-1.5 text-sm bg-white dark:bg-panel text-gray-900 dark:text-ink"
            @blur="onMemoBlur"
          />
        </label>
        <p class="mt-1 text-xs text-gray-400 dark:text-muted">
          {{ memoSaving ? '保存中...' : '' }}
        </p>
        <p v-if="memoError" class="mt-1 text-xs text-red-600 dark:text-red-400">{{ memoError }}</p>
      </section>

      <p
        v-if="achievement && achievement.milestoneDays !== null"
        class="flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
      >
        <FlagIcon class="h-4.5 w-4.5 shrink-0" />
        <span class="font-semibold">通算{{ achievement.milestoneDays }}日目のトレーニング！</span>
      </p>
      <p
        v-if="achievement?.comeback"
        class="flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
      >
        <ArrowPathIcon class="h-4.5 w-4.5 shrink-0" />
        <span class="font-semibold">お帰りなさい！久しぶりのトレーニング</span>
      </p>

      <ClientOnly>
        <draggable
          v-model="session.exercises"
          item-key="id"
          handle=".drag-handle"
          class="flex flex-col gap-4"
          @end="onExerciseDragEnd"
        >
          <template #item="{ element }">
            <section
              v-if="groupFor(element.exerciseId)"
              class="rounded-lg bg-white dark:bg-panel p-4 shadow"
            >
              <div class="mb-2 flex items-center justify-between">
                <span class="flex items-center gap-2">
                  <span class="drag-handle cursor-grab text-gray-400 dark:text-muted">⠿</span>
                  <p class="text-sm font-semibold text-gray-900 dark:text-ink">
                    {{ groupFor(element.exerciseId)!.name }}
                  </p>
                </span>
                <button
                  type="button"
                  class="text-xs text-brand-600 dark:text-accent"
                  @click="onAddSet(element.exerciseId)"
                >
                  ＋セット追加
                </button>
              </div>
              <!-- セット数が増えると縦に伸びて見づらいため、種目単位でヘッダー帯を1回だけ出し、
                   各セットは1行のコンパクトな表形式にする（ユーザー指摘、2026-09-05）。重量・回数の列は
                   frで種目カードの幅いっぱいまで伸ばし、右端に余白が余らないようにしている。それぞれの
                   入力欄の右に単位（kg・回）を添えることで、見出しの文言を短くできている。
                   列にminmaxで下限を設けているのは、画面幅が狭いと回数欄が数字の入る幅より縮んで
                   「10」が見切れて「1」に見えてしまう不具合を防ぐため（ユーザー報告、2026-09-05）。
                   下限を割り込むほど狭い場合は個別にoverflow-x-autoで横スクロールさせ、他の要素を
                   巻き込んで崩れないようにする -->
              <div class="overflow-x-auto">
                <div class="min-w-[17rem] overflow-hidden rounded-lg">
                  <div
                    class="grid grid-cols-[2.75rem_minmax(4.5rem,1.15fr)_minmax(3.5rem,0.85fr)_2.25rem] gap-x-2.5 bg-gray-100 dark:bg-white/5 px-3 py-1.5"
                  >
                    <span class="text-xs font-semibold text-gray-500 dark:text-muted">セット</span>
                    <span class="text-xs font-semibold text-gray-500 dark:text-muted">重量</span>
                    <span class="text-xs font-semibold text-gray-500 dark:text-muted">回数</span>
                    <span></span>
                  </div>
                  <template v-for="(set, i) in groupFor(element.exerciseId)!.sets" :key="set.id">
                    <div v-if="setInputs[set.id]">
                      <div
                        v-if="confirmingSetDeleteId === set.id"
                        class="flex items-center gap-2 px-3 py-1.5"
                        :class="i % 2 === 1 ? 'bg-gray-50 dark:bg-surface' : ''"
                      >
                        <p class="flex-1 text-xs text-gray-700 dark:text-ink">
                          {{ set.setOrder }}セット目を削除しますか？（元に戻せません）
                        </p>
                        <button
                          type="button"
                          :disabled="setDeleting[set.id]"
                          class="shrink-0 rounded border border-gray-300 dark:border-border-dark px-2 py-1 text-xs text-gray-700 dark:text-ink disabled:opacity-50"
                          @click="confirmingSetDeleteId = null"
                        >
                          キャンセル
                        </button>
                        <button
                          type="button"
                          :disabled="setDeleting[set.id]"
                          class="shrink-0 rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          @click="onDeleteSet(set.id)"
                        >
                          {{ setDeleting[set.id] ? '削除中...' : '削除する' }}
                        </button>
                      </div>
                      <div
                        v-else
                        class="grid grid-cols-[2.75rem_minmax(4.5rem,1.15fr)_minmax(3.5rem,0.85fr)_2.25rem] items-center gap-x-2.5 px-3 py-1.5"
                        :class="i % 2 === 1 ? 'bg-gray-50 dark:bg-surface' : ''"
                      >
                        <span
                          class="text-center text-lg font-bold tabular-nums text-gray-900 dark:text-ink"
                          >{{ set.setOrder }}</span
                        >
                        <span class="flex min-w-0 items-baseline gap-1.5">
                          <input
                            v-model="setInputs[set.id]!.weight"
                            type="number"
                            step="0.5"
                            min="0"
                            placeholder="自重"
                            class="w-full min-w-0 rounded-lg border border-gray-300 dark:border-border-dark px-2.5 py-1.5 text-right text-base tabular-nums bg-white dark:bg-panel text-gray-900 dark:text-ink"
                            @blur="onSetFieldBlur(set.id)"
                          />
                          <span class="shrink-0 text-xs text-gray-500 dark:text-muted">kg</span>
                        </span>
                        <span class="flex min-w-0 items-baseline gap-1.5">
                          <input
                            v-model="setInputs[set.id]!.reps"
                            type="number"
                            min="1"
                            class="w-full min-w-0 rounded-lg border border-gray-300 dark:border-border-dark px-2.5 py-1.5 text-right text-base tabular-nums bg-white dark:bg-panel text-gray-900 dark:text-ink"
                            @blur="onSetFieldBlur(set.id)"
                          />
                          <span class="shrink-0 text-xs text-gray-500 dark:text-muted">回</span>
                        </span>
                        <span class="flex justify-center">
                          <button
                            type="button"
                            class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 before:absolute before:-inset-1.5 before:content-['']"
                            aria-label="このセットを削除"
                            @click="confirmingSetDeleteId = set.id"
                          >
                            <TrashIcon class="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
              <template v-for="set in groupFor(element.exerciseId)!.sets" :key="`msg-${set.id}`">
                <p v-if="setSaving[set.id]" class="mt-1 text-xs text-gray-400 dark:text-muted">
                  {{ set.setOrder }}セット目を保存中...
                </p>
                <p v-if="setErrors[set.id]" class="mt-1 text-xs text-red-600 dark:text-red-400">
                  {{ setErrors[set.id] }}
                </p>
                <p v-if="setDeleteErrors[set.id]" class="mt-1 text-xs text-red-600 dark:text-red-400">
                  {{ setDeleteErrors[set.id] }}
                </p>
              </template>
              <p
                v-if="personalBestFor(element.exerciseId)"
                class="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
              >
                <TrophyIcon class="h-4.5 w-4.5 shrink-0" />
                <span>
                  <span class="font-semibold">自己ベスト更新！</span>
                  {{ personalBestFor(element.exerciseId)!.weightKg }}kg
                  <span class="text-xs text-amber-800 dark:text-amber-300"
                    >（これまで {{ personalBestFor(element.exerciseId)!.previousBestKg }}kg）</span
                  >
                </span>
              </p>
            </section>
          </template>
        </draggable>
      </ClientOnly>

      <p v-if="exerciseOrderError" class="text-center text-sm text-red-600 dark:text-red-400">
        {{ exerciseOrderError }}
      </p>

      <p v-if="addSetError" class="text-center text-sm text-red-600 dark:text-red-400">
        {{ addSetError }}
      </p>

      <p
        v-if="groupedSets.length === 0 && pendingExercises.length === 0"
        class="text-center text-sm text-gray-500 dark:text-muted"
      >
        まだ種目が追加されていません
      </p>

      <section
        v-if="pendingExercises.length > 0"
        class="rounded-lg bg-white dark:bg-panel p-4 shadow"
      >
        <p class="mb-2 text-sm font-semibold text-gray-900 dark:text-ink">入力待ちの種目</p>
        <ul class="space-y-1">
          <li v-for="p in pendingExercises" :key="p.exerciseId">
            <button
              type="button"
              class="w-full rounded border border-gray-300 dark:border-border-dark px-2 py-1.5 text-left text-sm text-gray-700 dark:text-ink"
              @click="onStartPendingExercise(p.exerciseId)"
            >
              {{ p.name }}
            </button>
          </li>
        </ul>
      </section>

      <section v-if="showRoutinePicker" class="rounded-lg bg-white dark:bg-panel p-4 shadow">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-gray-900 dark:text-ink">ルーティンを選ぶ</p>
          <button
            type="button"
            :disabled="routineApplying"
            class="text-xs text-gray-500 dark:text-muted disabled:opacity-50"
            @click="onCloseRoutinePicker"
          >
            閉じる
          </button>
        </div>
        <p v-if="routinePickerPending" class="text-sm text-gray-500 dark:text-muted">
          読み込み中...
        </p>
        <p v-else-if="routineApplying" class="text-sm text-gray-500 dark:text-muted">適用中...</p>
        <template v-else-if="routines && routines.length > 0">
          <ul class="space-y-1">
            <li v-for="r in routines" :key="r.id">
              <button
                type="button"
                :disabled="routineApplying"
                class="w-full rounded border border-gray-300 dark:border-border-dark px-2 py-1.5 text-left text-sm text-gray-700 dark:text-ink disabled:opacity-50"
                @click="onApplyRoutine(r.id)"
              >
                {{ r.name }}
              </button>
            </li>
          </ul>
        </template>
        <p v-else class="text-sm text-gray-500 dark:text-muted">
          ルーティンがまだ登録されていません。
          <NuxtLink to="/routines" class="text-brand-600 dark:text-accent"
            >ルーティンを登録する</NuxtLink
          >
        </p>
        <p v-if="routineApplyError" class="mt-2 text-sm text-red-600 dark:text-red-400">
          {{ routineApplyError }}
        </p>
        <p v-if="routineApplyNotice" class="mt-2 text-sm text-gray-600 dark:text-muted">
          {{ routineApplyNotice }}
        </p>
      </section>

      <!-- 一部の種目のみ重複除外された場合の通知（Issue #84）。適用成功でピッカーは閉じるため、
           ピッカーの外に置いてピッカーが閉じた後も表示され続けるようにする -->
      <p
        v-if="routineApplyNotice && !showRoutinePicker"
        class="rounded-lg bg-white dark:bg-panel p-4 text-sm text-gray-600 dark:text-muted shadow"
      >
        {{ routineApplyNotice }}
      </p>

      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 rounded border border-brand-600 dark:border-accent py-2 text-sm font-semibold text-brand-600 dark:text-accent"
          @click="onGoToExercisePicker"
        >
          ＋種目を追加
        </button>
        <button
          type="button"
          class="flex-1 rounded border border-brand-600 dark:border-accent py-2 text-sm font-semibold text-brand-600 dark:text-accent"
          @click="onOpenRoutinePicker"
        >
          ＋ルーティンから選ぶ
        </button>
      </div>
    </div>
  </div>
</template>
