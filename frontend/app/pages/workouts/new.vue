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

// --- 記録済みセットの値編集（⑤ルーティンの目安セット編集と同じ、常時入力欄＋blur自動保存） ---
// 「編集」ボタンで入力モードに切り替えるトグル方式は廃止し、⑤側の方式に統一した（Issue #95）。
// セットごとに入力中の値をsetIdをキーに保持する。既に値がある場合は上書きしない
// （他のセット追加・ルーティン適用のたびに入力中の値が巻き戻るのを防ぐため）
// weightはtype="number"のv-modelがVue 3.4以降で有効な数値をNumberとして保持するため
// string | numberで持つ（空欄=自重のときのみstringの''のまま）
const setInputs = reactive<Record<string, { weight: string | number; reps: string | number }>>({})
const setSaving = reactive<Record<string, boolean>>({})
const setErrors = reactive<Record<string, string>>({})

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
async function onSetFieldBlur(setId: string) {
  const inputs = setInputs[setId]
  if (!inputs) return
  const reps = Number(inputs.reps)
  if (!Number.isInteger(reps) || reps <= 0) return
  const weightRaw = String(inputs.weight).trim()
  const weightKg = weightRaw ? Number(weightRaw) : null

  setSaving[setId] = true
  setErrors[setId] = ''
  try {
    await updateSet(setId, weightKg, reps)
  } catch {
    setErrors[setId] = 'セットの更新に失敗しました。時間をおいて再度お試しください'
  } finally {
    setSaving[setId] = false
  }
}

// --- セット追加（Issue #91：自動保存方式への統一） ---
// ⑤ルーティン編集の「＋目安セットを追加」と同じ方針：デフォルト値（自重・10回）で
// その場でAPIに登録し、常時表示の入力欄でその場で重量・回数を手直ししてもらう
const DEFAULT_SET_REPS = 10
const addSetError = ref('')

async function onAddSet(exerciseId: string) {
  addSetError.value = ''
  try {
    const set = await addSet(exerciseId, DEFAULT_SET_REPS)
    ensureSetInput(set)
  } catch {
    addSetError.value = 'セットの記録に失敗しました。時間をおいて再度お試しください'
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
          <button type="button" class="text-xs text-blue-600" @click="onAddSet(group.exerciseId)">
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
            <div class="grid grid-cols-[2.75rem_minmax(4.5rem,1.15fr)_minmax(3.5rem,0.85fr)_2.25rem] gap-x-2.5 bg-gray-100 px-3 py-1.5">
              <span class="text-xs font-semibold text-gray-500">セット</span>
              <span class="text-xs font-semibold text-gray-500">重量</span>
              <span class="text-xs font-semibold text-gray-500">回数</span>
              <span></span>
            </div>
            <template v-for="(set, i) in group.sets" :key="set.id">
              <div
                v-if="setInputs[set.id]"
                class="grid grid-cols-[2.75rem_minmax(4.5rem,1.15fr)_minmax(3.5rem,0.85fr)_2.25rem] items-center gap-x-2.5 px-3 py-1.5"
                :class="i % 2 === 1 ? 'bg-gray-50' : ''"
              >
                <span class="text-center text-lg font-bold tabular-nums text-gray-900">{{ set.setOrder }}</span>
                <span class="flex min-w-0 items-baseline gap-1.5">
                  <input
                    v-model="setInputs[set.id]!.weight"
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="自重"
                    class="w-full min-w-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-right text-base tabular-nums"
                    @blur="onSetFieldBlur(set.id)"
                  />
                  <span class="shrink-0 text-xs text-gray-500">kg</span>
                </span>
                <span class="flex min-w-0 items-baseline gap-1.5">
                  <input
                    v-model="setInputs[set.id]!.reps"
                    type="number"
                    min="1"
                    class="w-full min-w-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-right text-base tabular-nums"
                    @blur="onSetFieldBlur(set.id)"
                  />
                  <span class="shrink-0 text-xs text-gray-500">回</span>
                </span>
                <span class="flex justify-center">
                  <button
                    type="button"
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600"
                    aria-label="このセットを削除"
                    @click="removeSet(set.id)"
                  >
                    <TrashIcon class="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </template>
          </div>
        </div>
        <template v-for="set in group.sets" :key="`msg-${set.id}`">
          <p v-if="setSaving[set.id]" class="mt-1 text-xs text-gray-400">
            {{ set.setOrder }}セット目を保存中...
          </p>
          <p v-if="setErrors[set.id]" class="mt-1 text-xs text-red-600">{{ setErrors[set.id] }}</p>
        </template>
      </section>

      <p v-if="addSetError" class="text-center text-sm text-red-600">{{ addSetError }}</p>

      <p
        v-if="groupedSets.length === 0 && pendingExercises.length === 0"
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

      <div class="flex gap-2">
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
          class="flex w-full items-center justify-center gap-1.5 rounded border border-red-600 py-2 text-sm font-semibold text-red-600"
          @click="confirmingDelete = true"
        >
          <TrashIcon class="h-4 w-4" />この記録を削除
        </button>
        <p v-if="deleteError" class="mt-2 text-sm text-red-600">{{ deleteError }}</p>
      </section>
    </div>
  </div>
</template>
