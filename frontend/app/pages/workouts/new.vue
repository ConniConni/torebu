<script setup lang="ts">
// ③ 記録作成。指定日(省略時は今日)のworkoutを開始し、種目ごとにセット(重量・回数)を
// 積み上げていく本体画面
definePageMeta({ middleware: 'auth' })

const { exercises, fetchExercises } = useExercises()
if (!exercises.value) {
  await fetchExercises()
}

const { session, startWorkout, addSet, removeSet, updateSet, updateMemo, finishWorkout, deleteWorkout } =
  useWorkoutSession()

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

// ④種目選択・⑦種目追加から戻ってきた直後は、選ばれた種目のセット入力欄を開いた状態にする
const pickedExerciseId = usePickedExerciseId()
const activeExerciseId = ref<string | null>(switchedWorkout ? null : pickedExerciseId.value)
pickedExerciseId.value = null

const pendingExercises = usePendingExercises()
if (switchedWorkout) {
  pendingExercises.value = []
}

const weightInput = ref('')
const repsInput = ref('')
const submitting = ref(false)
const errorMessage = ref('')

function exerciseName(exerciseId: string) {
  return exercises.value?.find((e) => e.id === exerciseId)?.name ?? '(不明な種目)'
}

const groupedSets = computed(() => {
  const byExercise = new Map<string, typeof session.value.sets>()
  for (const set of session.value.sets) {
    byExercise.set(set.exerciseId, [...(byExercise.get(set.exerciseId) ?? []), set])
  }
  return [...byExercise.entries()].map(([exerciseId, sets]) => ({
    exerciseId,
    name: exerciseName(exerciseId),
    sets: [...sets].sort((a, b) => a.setOrder - b.setOrder),
  }))
})

// ⑤ルーティンから種目一式を展開する機能（Issue13→Issue #76で「即登録＋手直し」方式に変更）。
// 目安セット（targetSets）が設定されている種目は、その場でworkout_setsとして即登録する
// （修正が必要な分だけ既存のセット編集UIで手直ししてもらう想定。docs/backlog.md参照）。
// targetSetsが無い（未設定）種目は、従来どおり「セット入力がまだの種目」として積んでおくだけの
// 一時的なキュー（このページのローカル状態）に入れ、既存の1種目ずつのセット入力フロー
// （activeExerciseId）にそのまま乗せる
const { routines, fetchRoutines, fetchRoutineDetail } = useRoutines()
const showRoutinePicker = ref(false)
const routinePickerPending = ref(false)
const routineApplying = ref(false)
const routineApplyError = ref('')
const routineApplyNotice = ref('')

// 既にこのworkoutに乗っている（セット入力済み or 入力待ち or 入力中の）種目ID。
// ルーティン適用時、ここに含まれる種目は重複として除外する
const takenExerciseIds = computed(() => {
  const ids = new Set(groupedSets.value.map((g) => g.exerciseId))
  for (const p of pendingExercises.value) ids.add(p.exerciseId)
  if (activeExerciseId.value) ids.add(activeExerciseId.value)
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
        await addSet(e.exerciseId, target.reps, target.weightKg ?? undefined)
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

// 入力待ちの種目をタップしたら、既存のセット入力フローに切り替える
function onStartPendingExercise(exerciseId: string) {
  pendingExercises.value = pendingExercises.value.filter((p) => p.exerciseId !== exerciseId)
  activeExerciseId.value = exerciseId
}

// 記録済みの種目カードから「＋セット追加」を押したときの切り替え。
// 入力待ちキューからの取り出しは不要な点だけがonStartPendingExerciseと異なる
// （Issue #69：同じ種目にさらにセットを追加する際、④種目選択を経由しなくて済むようにする）
function onAddMoreSets(exerciseId: string) {
  activeExerciseId.value = exerciseId
}

const activeExerciseName = computed(() =>
  activeExerciseId.value ? exerciseName(activeExerciseId.value) : '',
)

// activeExerciseIdが既にgroupedSetsに記録済みの種目を指しているか（＝「＋セット追加」で
// 既存カードにインライン入力を開いている状態）。この場合は末尾の独立した入力カードを
// 出さず、既存カード内のインライン入力欄に任せる（Issue #82）
const isAddingSetsToExistingExercise = computed(
  () => activeExerciseId.value !== null && groupedSets.value.some((g) => g.exerciseId === activeExerciseId.value),
)

async function onAddSet() {
  if (!activeExerciseId.value) return
  const reps = Number(repsInput.value)
  if (!Number.isInteger(reps) || reps <= 0) return
  // type="number"の<input>はv-model経由でも値がstring/numberどちらで来るか環境依存なため、
  // 一度Stringに揃えてから空欄判定する
  const weightRaw = String(weightInput.value).trim()
  const weightKg = weightRaw ? Number(weightRaw) : undefined

  submitting.value = true
  errorMessage.value = ''
  try {
    await addSet(activeExerciseId.value, reps, weightKg)
    repsInput.value = ''
    // 重量は同じ種目内で連続して同じ値を使うことが多いため、入力欄はあえてクリアしない
  } catch {
    errorMessage.value = 'セットの記録に失敗しました。時間をおいて再度お試しください'
  } finally {
    submitting.value = false
  }
}

function onDoneWithExercise() {
  activeExerciseId.value = null
  weightInput.value = ''
  repsInput.value = ''
}

// --- 記録済みセットの値編集（⑥記録詳細のonStartEditSet/onSaveSet相当を移植） ---
const editingSetId = ref<string | null>(null)
const editWeightInput = ref('')
const editRepsInput = ref('')
const setEditSaving = ref(false)
const setEditError = ref('')

function onStartEditSet(set: (typeof session.value.sets)[number]) {
  editingSetId.value = set.id
  editWeightInput.value = set.weightKg === null ? '' : String(set.weightKg)
  editRepsInput.value = String(set.reps)
  setEditError.value = ''
}

// 「保存」ボタンは持たず、重量・回数の入力欄からblurするたびに自動保存する
// （メモと同じ方針）。値が不正な間（回数が空・0以下等）は保存をスキップし、編集モードのまま
// 待つ。保存が終わればeditingSetIdは維持したまま値だけ更新されるので、そのまま
// 「閉じる」で表示モードへ戻る。閉じるタイミングでは保存中のPromiseを待つ必要はない
// （ページ遷移を伴わないため、保存が完了すれば表示側のsession.value.setsが自然に更新される）
async function onEditFieldBlur() {
  if (!editingSetId.value) return
  const reps = Number(editRepsInput.value)
  if (!Number.isInteger(reps) || reps <= 0) return
  const weightRaw = String(editWeightInput.value).trim()
  const weightKg = weightRaw ? Number(weightRaw) : null

  setEditSaving.value = true
  setEditError.value = ''
  try {
    await updateSet(editingSetId.value, weightKg, reps)
  } catch {
    setEditError.value = 'セットの更新に失敗しました。時間をおいて再度お試しください'
  } finally {
    setEditSaving.value = false
  }
}

function onCloseEditSet() {
  editingSetId.value = null
}

// ③記録作成を離れる操作（旧「今日の記録を完了」「ホームへ戻る」）。セット記録・削除は
// 既に即APIへ反映されているため、finishWorkout自体は「②ホームのキャッシュを再取得してから
// セッション状態をリセットする」だけの処理（workoutが未作成なら再取得もしない）。
// 「今日の記録を完了」だけがこの再取得をしていて、「ホームへ戻る」は素のリンクだったため
// 遷移直後の②ホームに今回の変更が反映されないことがあった。実質同じ操作なので1つに統合する。
// メモの自動保存がblur待ちで進行中の場合があるため、遷移前に必ず待ち合わせる
async function onLeaveWorkout() {
  await (pendingMemoSave ?? saveMemoIfChanged())
  await finishWorkout()
  // 入力待ちの種目もworkout単位の状態のため、離脱と合わせてリセットする
  // （そうしないと次回の記録開始時に前回分の入力待ち種目が残ってしまう）
  pendingExercises.value = []
  await navigateTo('/')
}

// --- 記録全体の削除（⑥記録詳細のconfirmingDelete/onDeleteWorkout相当を移植） ---
// window.confirm()は「このページに追加のダイアログを表示させない」でブラウザ側から無効化されうる
// (docs/backlog.md参照)ため、画面内の2段階確認(確認表示→実行ボタン)にする
const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')

async function onDeleteWorkout() {
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteWorkout()
    pendingExercises.value = []
    await navigateTo('/')
  } catch {
    deleteError.value = '記録の削除に失敗しました。時間をおいて再度お試しください'
    deleting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <h1 class="text-base font-semibold text-gray-900">{{ targetDate }}の記録</h1>
        <button type="button" class="text-sm text-gray-500" @click="onLeaveWorkout">
          ホームへ戻る
        </button>
      </div>

      <section class="rounded-lg bg-white p-4 shadow">
        <label class="flex flex-col gap-1 text-sm text-gray-700">
          メモ
          <textarea
            v-model="memoInput"
            rows="2"
            maxlength="500"
            placeholder="今日の体調・気づいたことなど"
            class="rounded border border-gray-300 px-2 py-1.5 text-sm"
            @blur="onMemoBlur"
          />
        </label>
        <p class="mt-1 text-xs text-gray-400">{{ memoSaving ? '保存中...' : '' }}</p>
        <p v-if="memoError" class="mt-1 text-xs text-red-600">{{ memoError }}</p>
      </section>

      <section
        v-for="group in groupedSets"
        :key="group.exerciseId"
        class="rounded-lg bg-white p-4 shadow"
      >
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-gray-900">{{ group.name }}</p>
          <button
            v-if="activeExerciseId !== group.exerciseId"
            type="button"
            class="text-xs text-blue-600"
            @click="onAddMoreSets(group.exerciseId)"
          >
            ＋セット追加
          </button>
        </div>
        <ul class="space-y-2">
          <li v-for="set in group.sets" :key="set.id" class="text-sm text-gray-700">
            <template v-if="editingSetId === set.id">
              <div class="flex items-end gap-2">
                <label class="flex flex-1 flex-col gap-1 text-xs text-gray-500">
                  重量(kg・自重は空欄)
                  <input
                    v-model="editWeightInput"
                    type="number"
                    step="0.5"
                    min="0"
                    class="rounded border border-gray-300 px-2 py-1.5 text-sm"
                    @blur="onEditFieldBlur"
                  />
                </label>
                <label class="flex flex-1 flex-col gap-1 text-xs text-gray-500">
                  回数
                  <input
                    v-model="editRepsInput"
                    type="number"
                    min="1"
                    class="rounded border border-gray-300 px-2 py-1.5 text-sm"
                    @blur="onEditFieldBlur"
                  />
                </label>
              </div>
              <div class="mt-1 flex items-center gap-2">
                <button type="button" class="text-xs text-gray-500" @click="onCloseEditSet">
                  閉じる
                </button>
                <span v-if="setEditSaving" class="text-xs text-gray-400">保存中...</span>
              </div>
            </template>
            <div v-else class="flex items-center justify-between">
              <span class="flex items-baseline gap-1 tabular-nums">
                <span><span class="inline-block w-6 text-right">{{ set.setOrder }}</span>セット目：</span>
                <span>
                  <span class="inline-block w-14 text-right">{{ set.weightKg ?? '自重' }}</span
                  >{{ set.weightKg ? 'kg' : '' }}
                </span>
                <span>×</span>
                <span><span class="inline-block w-6 text-right">{{ set.reps }}</span>回</span>
              </span>
              <span class="flex shrink-0 gap-2">
                <button type="button" class="text-xs text-gray-500" @click="onStartEditSet(set)">
                  編集
                </button>
                <button type="button" class="text-xs text-red-600" @click="removeSet(set.id)">
                  削除
                </button>
              </span>
            </div>
          </li>
        </ul>

        <!-- 記録済みの種目に続けてセットを追加する場合は、このカード内にインラインで
             入力欄を出す（Issue #82：別カードにすると同じ種目のカードが2枚並んで
             紛らわしいため、既存カードに統合する） -->
        <div v-if="activeExerciseId === group.exerciseId" class="mt-3 border-t border-gray-100 pt-3">
          <div class="flex items-end gap-2">
            <label class="flex flex-1 flex-col gap-1 text-xs text-gray-500">
              重量(kg・自重は空欄)
              <input
                v-model="weightInput"
                type="number"
                step="0.5"
                min="0"
                class="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label class="flex flex-1 flex-col gap-1 text-xs text-gray-500">
              回数
              <input
                v-model="repsInput"
                type="number"
                min="1"
                class="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              :disabled="!repsInput || submitting"
              class="shrink-0 whitespace-nowrap rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              @click="onAddSet"
            >
              記録
            </button>
          </div>
          <p v-if="errorMessage" class="mt-2 text-sm text-red-600">{{ errorMessage }}</p>
          <button type="button" class="mt-2 text-xs text-gray-500" @click="onDoneWithExercise">
            この種目の入力を終える
          </button>
        </div>
      </section>

      <p v-if="setEditError" class="text-center text-sm text-red-600">{{ setEditError }}</p>

      <p
        v-if="groupedSets.length === 0 && !activeExerciseId && pendingExercises.length === 0"
        class="text-center text-sm text-gray-500"
      >
        まだ種目が追加されていません
      </p>

      <section v-if="pendingExercises.length > 0" class="rounded-lg bg-white p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900">入力待ちの種目</p>
        <ul class="space-y-1">
          <li v-for="p in pendingExercises" :key="p.exerciseId">
            <button
              type="button"
              class="w-full rounded border border-gray-300 px-2 py-1.5 text-left text-sm text-gray-700"
              @click="onStartPendingExercise(p.exerciseId)"
            >
              {{ p.name }}
            </button>
          </li>
        </ul>
      </section>

      <section v-if="showRoutinePicker" class="rounded-lg bg-white p-4 shadow">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-gray-900">ルーティンを選ぶ</p>
          <button
            type="button"
            :disabled="routineApplying"
            class="text-xs text-gray-500 disabled:opacity-50"
            @click="showRoutinePicker = false"
          >
            閉じる
          </button>
        </div>
        <p v-if="routinePickerPending" class="text-sm text-gray-500">読み込み中...</p>
        <p v-else-if="routineApplying" class="text-sm text-gray-500">適用中...</p>
        <template v-else-if="routines && routines.length > 0">
          <ul class="space-y-1">
            <li v-for="r in routines" :key="r.id">
              <button
                type="button"
                :disabled="routineApplying"
                class="w-full rounded border border-gray-300 px-2 py-1.5 text-left text-sm text-gray-700 disabled:opacity-50"
                @click="onApplyRoutine(r.id)"
              >
                {{ r.name }}
              </button>
            </li>
          </ul>
        </template>
        <p v-else class="text-sm text-gray-500">
          ルーティンがまだ登録されていません。
          <NuxtLink to="/routines" class="text-blue-600">ルーティンを登録する</NuxtLink>
        </p>
        <p v-if="routineApplyError" class="mt-2 text-sm text-red-600">{{ routineApplyError }}</p>
        <p v-if="routineApplyNotice" class="mt-2 text-sm text-gray-600">{{ routineApplyNotice }}</p>
      </section>

      <!-- 一部の種目のみ重複除外された場合の通知（Issue #84）。適用成功でピッカーは閉じるため、
           ピッカーの外に置いてピッカーが閉じた後も表示され続けるようにする -->
      <p
        v-if="routineApplyNotice && !showRoutinePicker"
        class="rounded-lg bg-white p-4 text-sm text-gray-600 shadow"
      >
        {{ routineApplyNotice }}
      </p>

      <!-- 記録済みの種目は上のgroupedSetsカード内にインライン入力欄が出るため、
           ここは「まだ記録の無い新規種目」を選んだ場合のみ表示する（Issue #82） -->
      <section
        v-if="activeExerciseId && !isAddingSetsToExistingExercise"
        class="rounded-lg bg-white p-4 shadow"
      >
        <p class="mb-2 text-sm font-semibold text-gray-900">{{ activeExerciseName }}</p>
        <div class="flex items-end gap-2">
          <label class="flex flex-1 flex-col gap-1 text-xs text-gray-500">
            重量(kg・自重は空欄)
            <input
              v-model="weightInput"
              type="number"
              step="0.5"
              min="0"
              class="rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label class="flex flex-1 flex-col gap-1 text-xs text-gray-500">
            回数
            <input
              v-model="repsInput"
              type="number"
              min="1"
              class="rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            :disabled="!repsInput || submitting"
            class="shrink-0 whitespace-nowrap rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            @click="onAddSet"
          >
            記録
          </button>
        </div>
        <p v-if="errorMessage" class="mt-2 text-sm text-red-600">{{ errorMessage }}</p>
        <button type="button" class="mt-2 text-xs text-gray-500" @click="onDoneWithExercise">
          この種目の入力を終える
        </button>
      </section>

      <div v-if="!activeExerciseId" class="flex gap-2">
        <button
          type="button"
          class="flex-1 rounded border border-blue-600 py-2 text-sm font-semibold text-blue-600"
          @click="navigateTo({ path: '/workouts/exercises', query: { returnTo: `/workouts/new?date=${targetDate}` } })"
        >
          ＋種目を追加
        </button>
        <button
          type="button"
          class="flex-1 rounded border border-blue-600 py-2 text-sm font-semibold text-blue-600"
          @click="onOpenRoutinePicker"
        >
          ＋ルーティンから選ぶ
        </button>
      </div>

      <section v-if="session.workoutId" class="rounded-lg bg-white p-4 shadow">
        <template v-if="confirmingDelete">
          <p class="text-sm text-gray-700">この記録を削除しますか？元に戻せません。</p>
          <div class="mt-2 flex gap-2">
            <button
              type="button"
              :disabled="deleting"
              class="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              @click="onDeleteWorkout"
            >
              {{ deleting ? '削除中...' : '削除する' }}
            </button>
            <button
              type="button"
              :disabled="deleting"
              class="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 disabled:opacity-50"
              @click="confirmingDelete = false"
            >
              キャンセル
            </button>
          </div>
        </template>
        <button
          v-else
          type="button"
          class="w-full rounded border border-red-600 py-2 text-sm font-semibold text-red-600"
          @click="confirmingDelete = true"
        >
          この記録を削除
        </button>
        <p v-if="deleteError" class="mt-2 text-sm text-red-600">{{ deleteError }}</p>
      </section>
    </div>
  </div>
</template>
