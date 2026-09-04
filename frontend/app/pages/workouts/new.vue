<script setup lang="ts">
// ③ 記録作成。今日のworkoutを開始し、種目ごとにセット(重量・回数)を積み上げていく本体画面
definePageMeta({ middleware: 'auth' })

const { exercises, fetchExercises } = useExercises()
if (!exercises.value) {
  await fetchExercises()
}

const { session, startWorkout, addSet, removeSet, finishWorkout } = useWorkoutSession()
const today = todayLocalDateString()
await startWorkout(today)

// ④種目選択・⑦種目追加から戻ってきた直後は、選ばれた種目のセット入力欄を開いた状態にする
const pickedExerciseId = usePickedExerciseId()
const activeExerciseId = ref<string | null>(pickedExerciseId.value)
pickedExerciseId.value = null

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

// ⑤ルーティンから種目一式を展開する機能（Issue13）。
// ルーティンはexerciseId・並び順のみを持ち重量・回数の目安値は持たないため（docs/backlog.md参照）、
// ここでは「セット入力がまだの種目」を積んでおくだけの一時的なキュー（このページのローカル状態）として持つ。
// 選ばれた種目は既存の1種目ずつのセット入力フロー（activeExerciseId）にそのまま乗せる
const { routines, fetchRoutines, fetchRoutineDetail } = useRoutines()
const showRoutinePicker = ref(false)
const routinePickerPending = ref(false)
const routineApplyError = ref('')
const pendingExercises = ref<{ exerciseId: string; name: string }[]>([])

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
  try {
    const detail = await fetchRoutineDetail(routineId)
    const newItems = detail.exercises
      .filter((e) => !takenExerciseIds.value.has(e.exerciseId))
      .map((e) => ({ exerciseId: e.exerciseId, name: e.exercise.name }))
    pendingExercises.value = [...pendingExercises.value, ...newItems]
    showRoutinePicker.value = false
  } catch {
    routineApplyError.value = 'ルーティンの取得に失敗しました。時間をおいて再度お試しください'
  }
}

// 入力待ちの種目をタップしたら、既存のセット入力フローに切り替える
function onStartPendingExercise(exerciseId: string) {
  pendingExercises.value = pendingExercises.value.filter((p) => p.exerciseId !== exerciseId)
  activeExerciseId.value = exerciseId
}

const activeExerciseName = computed(() =>
  activeExerciseId.value ? exerciseName(activeExerciseId.value) : '',
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

async function onFinish() {
  await finishWorkout()
  await navigateTo('/')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <h1 class="text-base font-semibold text-gray-900">{{ today }}の記録</h1>
        <NuxtLink to="/" class="text-sm text-gray-500">中断してホームへ</NuxtLink>
      </div>

      <section
        v-for="group in groupedSets"
        :key="group.exerciseId"
        class="rounded-lg bg-white p-4 shadow"
      >
        <p class="mb-2 text-sm font-semibold text-gray-900">{{ group.name }}</p>
        <ul class="space-y-1">
          <li
            v-for="set in group.sets"
            :key="set.id"
            class="flex items-center justify-between text-sm text-gray-700"
          >
            <span>{{ set.setOrder }}セット目：{{ set.weightKg ?? '自重' }}{{ set.weightKg ? 'kg' : '' }} × {{ set.reps }}回</span>
            <button type="button" class="text-xs text-red-600" @click="removeSet(set.id)">削除</button>
          </li>
        </ul>
      </section>

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
          <button type="button" class="text-xs text-gray-500" @click="showRoutinePicker = false">
            閉じる
          </button>
        </div>
        <p v-if="routinePickerPending" class="text-sm text-gray-500">読み込み中...</p>
        <template v-else-if="routines && routines.length > 0">
          <ul class="space-y-1">
            <li v-for="r in routines" :key="r.id">
              <button
                type="button"
                class="w-full rounded border border-gray-300 px-2 py-1.5 text-left text-sm text-gray-700"
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
      </section>

      <section v-if="activeExerciseId" class="rounded-lg bg-white p-4 shadow">
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

      <div v-else class="flex gap-2">
        <button
          type="button"
          class="flex-1 rounded border border-blue-600 py-2 text-sm font-semibold text-blue-600"
          @click="navigateTo('/workouts/exercises')"
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

      <button
        type="button"
        class="w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white"
        @click="onFinish"
      >
        今日の記録を完了
      </button>
    </div>
  </div>
</template>
