<script setup lang="ts">
// ⑤ ルーティン編集。名前変更・削除、種目の追加/削除/並び替えを行う
import draggable from 'vuedraggable'

definePageMeta({ middleware: 'auth' })

// 目安セット1件。weightKgはnull=自重。入力欄からの一時的な空文字列も許容し、
// 保存直前にnormalizeTargetSetsで数値/nullに正規化する
interface TargetSet {
  weightKg: number | string | null
  reps: number | string
}
interface RoutineExerciseItem {
  id: string
  routineId: string
  exerciseId: string
  sortOrder: number
  targetSets: TargetSet[]
  exercise: { id: string; name: string; muscleGroup: MuscleGroup }
}
interface RoutineDetail {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  exercises: RoutineExerciseItem[]
}

const route = useRoute()
const routineId = route.params.id as string
const requestFetch = useRequestFetch()
// ⑤一覧(routines/index.vue)とルーティンの一覧状態(useState)を共有するため、
// 名前変更・削除はここのrenameRoutine/deleteRoutine経由で行う。
// 直接$fetchすると一覧側のキャッシュが更新されず、削除・改名後に一覧へ戻った際
// 古い名前が残って見える不具合になる(2026-09-05発見)
const { renameRoutine, deleteRoutine } = useRoutines()

const routine = ref<RoutineDetail | null>(null)
const pending = ref(false)
const error = ref(false)

async function fetchRoutine() {
  pending.value = true
  error.value = false
  try {
    routine.value = await requestFetch<RoutineDetail>(`/api/routines/${routineId}`)
  } catch {
    error.value = true
  } finally {
    pending.value = false
  }
}
await fetchRoutine()

const exerciseError = ref('')

// ④種目選択・⑦種目追加(returnTo=このページ)から選ばれた種目を、戻ってきたタイミングで追加する
const pickedExerciseId = usePickedExerciseId()
if (pickedExerciseId.value) {
  const exerciseId = pickedExerciseId.value
  pickedExerciseId.value = null
  try {
    await addExercise(exerciseId)
  } catch {
    exerciseError.value = '種目の追加に失敗しました。時間をおいて再度お試しください'
  }
}

const nameInput = ref(routine.value?.name ?? '')
watch(routine, (r) => {
  if (r) nameInput.value = r.name
})

// 種目の追加/削除/並び替えと同じく、名前欄も明示的な保存ボタンは持たず
// blur（フォーカスが外れたタイミング）で自動保存する。値が変わっていなければAPIは呼ばない
const savingName = ref(false)
const nameError = ref('')

async function onNameBlur() {
  const name = nameInput.value.trim()
  if (!routine.value || !name || name === routine.value.name) return
  savingName.value = true
  nameError.value = ''
  try {
    const updated = await renameRoutine(routineId, name)
    if (routine.value) routine.value.name = updated.name
  } catch {
    nameError.value = '名前の変更に失敗しました。時間をおいて再度お試しください'
  } finally {
    savingName.value = false
  }
}

// 種目を1つも追加せずにこの画面を離れる場合、空のルーティンを残さないよう自動削除する
// (Issue #87。本格的な遅延作成は規模が大きいため見送り、離脱時削除で代替する方針)。
// ブラウザを閉じる等ここを通らない離脱経路では取りこぼすが、その保険としてGET /routines側で
// 種目0件のルーティンを表示から除外している(backend/src/routes/routines.ts参照)
// なお「このルーティンを削除する」操作自体は⑤一覧画面（routines/index.vue）に移した
// （Issue #93。詳細画面単体だと🗑️アイコンだけでは意味が伝わりにくいため、一覧の行内に統合）
onBeforeRouteLeave(async (to) => {
  if (!routine.value || routine.value.exercises.length > 0) {
    return true
  }
  // 「＋種目を追加」で④種目選択へ向かう場合はこのページへ戻ってくる前提のため、
  // 種目0件でも消してはいけない（Issue #87時点でこの導線を考慮できておらず、新規ルーティンで
  // 最初の種目を選ぼうとすると「ルーティンの取得に失敗しました」になる不具合。Issue #93で発覚）
  if (to.path === '/workouts/exercises' && to.query.returnTo === `/routines/${routineId}`) {
    return true
  }
  try {
    await deleteRoutine(routineId)
  } catch {
    // 削除に失敗しても遷移自体はブロックしない。取りこぼしは一覧非表示の保険で吸収する
  }
  return true
})

async function addExercise(exerciseId: string) {
  if (!routine.value) return
  // ④種目選択は呼び出し元(③⑤)を区別せず全種目を表示するため、既に追加済みの種目を
  // 選び直すケースをここで防ぐ。target_setsは1行で複数セットを持てる設計のため、
  // 同じ種目を複数行に分けて追加する実用上のメリットは無く、選択ミスと判断してブロックする
  // （マージ先の行を選ばせる等のUIにはしない。ユーザー指摘、2026-09-05・Issue #78）
  if (routine.value.exercises.some((e) => e.exerciseId === exerciseId)) {
    exerciseError.value = 'この種目はすでに追加されています'
    return
  }
  exerciseError.value = ''
  const nextSortOrder = routine.value.exercises.length
    ? Math.max(...routine.value.exercises.map((e) => e.sortOrder)) + 1
    : 1
  const created = await $fetch<{
    id: string
    routineId: string
    exerciseId: string
    sortOrder: number
    targetSets: TargetSet[]
  }>(`/api/routines/${routineId}/exercises`, { method: 'POST', body: { exerciseId, sortOrder: nextSortOrder } })
  // POSTのレスポンスには種目名・部位が含まれないため、選択直前まで持っていたexercise一覧から補う
  const { exercises } = useExercises()
  const exercise = exercises.value?.find((e) => e.id === exerciseId)
  const newItem: RoutineExerciseItem = {
    ...created,
    exercise: exercise ?? { id: exerciseId, name: '(不明な種目)', muscleGroup: 'chest' },
  }
  routine.value.exercises = [...routine.value.exercises, newItem]
  // ③で種目を選んだ瞬間に1セット目がデフォルト値で即登録されるのと同じく、目安セットも1件
  // 即追加する。種目行に「削除」ボタンを別に持たず、目安セットを全部消したら種目ごと消える
  // （removeTargetSet参照）という設計に揃えるため、種目だけ0件のまま残る状態を作らない
  // （ユーザー指摘、2026-09-05・Issue #93）
  addTargetSet(newItem)
}

async function removeExercise(routineExerciseId: string) {
  if (!routine.value) return
  exerciseError.value = ''
  try {
    await $fetch(`/api/routines/${routineId}/exercises/${routineExerciseId}`, { method: 'DELETE' })
    routine.value.exercises = routine.value.exercises.filter((e) => e.id !== routineExerciseId)
  } catch {
    exerciseError.value = '種目の削除に失敗しました。時間をおいて再度お試しください'
  }
}

// vuedraggableのv-modelで並び替えた後、変化した行だけsortOrderをPATCHで反映する
// (見た目上のindex(1始まり)をそのまま新しいsortOrderとして使う)
async function onDragEnd() {
  if (!routine.value) return
  exerciseError.value = ''
  const updates = routine.value.exercises
    .map((e, index) => ({ item: e, sortOrder: index + 1 }))
    .filter(({ item, sortOrder }) => item.sortOrder !== sortOrder)

  try {
    await Promise.all(
      updates.map(({ item, sortOrder }) =>
        $fetch(`/api/routines/${routineId}/exercises/${item.id}`, {
          method: 'PATCH',
          body: { sortOrder },
        }),
      ),
    )
    for (const { item, sortOrder } of updates) {
      item.sortOrder = sortOrder
    }
  } catch {
    exerciseError.value = '並び替えの保存に失敗しました。時間をおいて再度お試しください'
    await fetchRoutine()
  }
}

// --- 目安セット(target_sets)の追加・編集・削除 ---
// routine_exercise単位でセット配列をまるごと持つ設計のため、行を追加・削除・編集するたびに
// 配列全体をPATCHで送り直す(workout_setsのような1セットごとのAPIは無い。docs/backlog.md参照)
const targetSetsSaving = ref<Record<string, boolean>>({})
const targetSetsErrors = ref<Record<string, string>>({})

// 重量・回数はworkout_setsと同じ基準(重量0.5kg刻み・999.5kg以下、回数は正の整数・999以下)で検証する
function normalizeTargetSets(sets: TargetSet[]) {
  return sets.map((s) => {
    const reps = Number(s.reps)
    const weightRaw = String(s.weightKg ?? '').trim()
    const weightKg = weightRaw ? Number(weightRaw) : null
    return { weightKg, reps }
  })
}

function isValidTargetSets(sets: { weightKg: number | null; reps: number }[]) {
  return sets.every(
    (s) =>
      Number.isInteger(s.reps) &&
      s.reps > 0 &&
      s.reps <= 999 &&
      (s.weightKg === null ||
        (s.weightKg > 0 && s.weightKg <= 999.5 && Math.round(s.weightKg * 2) === s.weightKg * 2)),
  )
}

// 「保存」ボタンは持たず、重量・回数の入力欄からblurするたびに自動保存する(他画面のセット編集と同じ方針)。
// 値が不正な間（回数が空・0以下等）は保存をスキップし、入力欄の値はそのまま残す
async function saveTargetSets(element: RoutineExerciseItem) {
  const normalized = normalizeTargetSets(element.targetSets)
  if (!isValidTargetSets(normalized)) return

  targetSetsSaving.value = { ...targetSetsSaving.value, [element.id]: true }
  targetSetsErrors.value = { ...targetSetsErrors.value, [element.id]: '' }
  try {
    const updated = await $fetch<{ targetSets: TargetSet[] }>(
      `/api/routines/${routineId}/exercises/${element.id}`,
      { method: 'PATCH', body: { targetSets: normalized } },
    )
    element.targetSets = updated.targetSets
  } catch {
    targetSetsErrors.value = {
      ...targetSetsErrors.value,
      [element.id]: '目安セットの保存に失敗しました。時間をおいて再度お試しください',
    }
  } finally {
    targetSetsSaving.value = { ...targetSetsSaving.value, [element.id]: false }
  }
}

// 新規行はいったんデフォルト値(自重・10回)で追加してすぐ保存し、その場で数値を手直ししてもらう。
// backlog.mdで検討したルーティン適用時の「まず登録して手直しする」方針と同じ考え方
function addTargetSet(element: RoutineExerciseItem) {
  element.targetSets = [...element.targetSets, { weightKg: null, reps: 10 }]
  saveTargetSets(element)
}

// 目安セットを最後の1件まで削除すると、種目自体も削除する（ルーティンが種目0件になると
// 自動削除されるのと同じ「空になったら消える」考え方を、routine_exercise単位にも揃えた。
// ユーザー指摘、2026-09-05・Issue #93）
function removeTargetSet(element: RoutineExerciseItem, index: number | string) {
  element.targetSets = element.targetSets.filter((_, i) => i !== Number(index))
  if (element.targetSets.length === 0) {
    removeExercise(element.id)
    return
  }
  saveTargetSets(element)
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <NuxtLink to="/routines" class="text-sm text-gray-500">← ルーティン一覧に戻る</NuxtLink>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error || !routine" class="text-center text-sm text-red-600">
        ルーティンの取得に失敗しました。時間をおいて再度お試しください
      </p>

      <template v-else>
        <label class="flex flex-col gap-1 text-sm text-gray-700">
          ルーティン名
          <input
            v-model="nameInput"
            type="text"
            maxlength="50"
            class="rounded border border-gray-300 px-3 py-2 text-sm"
            @blur="onNameBlur"
          />
        </label>
        <p v-if="savingName" class="text-xs text-gray-400">保存中...</p>
        <p v-if="nameError" class="text-sm text-red-600">{{ nameError }}</p>

        <div class="rounded-lg bg-white p-4 shadow">
          <div class="mb-2 flex items-center justify-between">
            <p class="text-sm font-semibold text-gray-900">種目</p>
            <NuxtLink
              :to="{ path: '/workouts/exercises', query: { returnTo: `/routines/${routineId}` } }"
              class="text-xs text-blue-600"
            >
              ＋種目を追加
            </NuxtLink>
          </div>

          <p v-if="routine.exercises.length === 0" class="text-sm text-gray-500">
            種目がまだ登録されていません
          </p>
          <ClientOnly v-else>
            <draggable
              v-model="routine.exercises"
              item-key="id"
              handle=".drag-handle"
              class="space-y-1"
              @end="onDragEnd"
            >
              <template #item="{ element }">
                <div class="rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
                  <span class="flex items-center gap-2">
                    <span class="drag-handle cursor-grab text-gray-400">⠿</span>
                    {{ element.exercise.name }}
                    <span class="text-xs text-gray-400">（{{ muscleGroupLabel(element.exercise.muscleGroup) }}）</span>
                  </span>

                  <div class="mt-1 flex flex-col items-start gap-1 pl-6">
                    <div
                      v-for="(set, index) in element.targetSets"
                      :key="index"
                      class="flex items-center gap-1 text-xs text-gray-600"
                    >
                      <input
                        v-model="set.weightKg"
                        type="number"
                        step="0.5"
                        min="0"
                        placeholder="自重"
                        class="w-14 rounded border border-gray-300 px-1 py-0.5 text-right"
                        @blur="saveTargetSets(element)"
                      />
                      <span>kg ×</span>
                      <input
                        v-model="set.reps"
                        type="number"
                        min="1"
                        class="w-10 rounded border border-gray-300 px-1 py-0.5 text-right"
                        @blur="saveTargetSets(element)"
                      />
                      <span>回</span>
                      <button
                        type="button"
                        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600"
                        aria-label="この目安セットを削除"
                        @click="removeTargetSet(element, index)"
                      >
                        <TrashIcon class="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button type="button" class="text-xs text-blue-600" @click="addTargetSet(element)">
                      ＋目安セットを追加
                    </button>
                    <p v-if="targetSetsSaving[element.id]" class="text-xs text-gray-400">保存中...</p>
                    <p v-if="targetSetsErrors[element.id]" class="text-xs text-red-600">
                      {{ targetSetsErrors[element.id] }}
                    </p>
                  </div>
                </div>
              </template>
            </draggable>
          </ClientOnly>
          <p v-if="exerciseError" class="mt-2 text-sm text-red-600">{{ exerciseError }}</p>
        </div>
      </template>
    </div>
  </div>
</template>
