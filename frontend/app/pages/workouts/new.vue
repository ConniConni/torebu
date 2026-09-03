<script setup lang="ts">
// ③ 記録作成。今日のworkoutを開始し、種目ごとにセット(重量・回数)を積み上げていく本体画面
definePageMeta({ middleware: 'auth' })

const { exercises, fetchExercises } = useExercises()
if (!exercises.value) {
  await fetchExercises()
}

const { session, startWorkout, addSet, removeSet, updateMemo, finishWorkout } = useWorkoutSession()
const today = todayLocalDateString()
await startWorkout(today)

const memoInput = ref(session.value.memo ?? '')
const memoSaving = ref(false)
async function onSaveMemo() {
  if (!memoInput.value.trim()) return
  memoSaving.value = true
  try {
    await updateMemo(memoInput.value)
  } finally {
    memoSaving.value = false
  }
}

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

// セット・メモのどちらかがあれば完了できる(メモだけの休養日記録なども許容する)
const canFinish = computed(
  () => groupedSets.value.length > 0 || !!session.value.memo?.trim(),
)
const finishing = ref(false)
// 完了ボタンの確認はwindow.confirm()を使わない。ブラウザが「このページに追加のダイアログを
// 表示させない」設定を自動で有効にすると、以後confirm()は常にfalseを返し、ボタンが完全に
// 無反応に見えてしまうため(実機検証で再現)。画面内の2段階確認に置き換える
const confirmingFinish = ref(false)

function onFinishClick() {
  if (!canFinish.value) return
  confirmingFinish.value = true
}

function onCancelFinish() {
  confirmingFinish.value = false
}

async function onConfirmFinish() {
  finishing.value = true
  try {
    await finishWorkout()
    await navigateTo('/')
  } finally {
    finishing.value = false
    confirmingFinish.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <h1 class="text-base font-semibold text-gray-900">{{ today }}の記録</h1>
        <NuxtLink to="/" class="text-sm text-gray-500">中断してホームへ</NuxtLink>
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
          />
        </label>
        <button
          type="button"
          :disabled="!memoInput.trim() || memoSaving"
          class="mt-2 rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 disabled:opacity-50"
          @click="onSaveMemo"
        >
          {{ memoSaving ? '保存中...' : 'メモを保存' }}
        </button>
      </section>

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

      <p v-if="groupedSets.length === 0 && !activeExerciseId" class="text-center text-sm text-gray-500">
        まだ種目が追加されていません
      </p>

      <section v-if="activeExerciseId" class="rounded-lg bg-white p-4 shadow">
        <NuxtLink to="/workouts/exercises" class="text-xs text-gray-500">← 種目選択に戻る</NuxtLink>
        <p class="mb-2 mt-1 text-sm font-semibold text-gray-900">{{ activeExerciseName }}</p>
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

      <button
        v-else
        type="button"
        class="w-full rounded border border-blue-600 py-2 text-sm font-semibold text-blue-600"
        @click="navigateTo('/workouts/exercises')"
      >
        ＋種目を追加
      </button>

      <hr class="border-gray-200" />

      <div v-if="confirmingFinish" class="rounded-lg border border-green-600 bg-green-50 p-4">
        <p class="mb-3 text-sm text-gray-800">{{ today }}の記録を完了しますか？</p>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 rounded border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-700"
            @click="onCancelFinish"
          >
            キャンセル
          </button>
          <button
            type="button"
            :disabled="finishing"
            class="flex-1 rounded bg-green-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
            @click="onConfirmFinish"
          >
            {{ finishing ? '完了処理中...' : '完了する' }}
          </button>
        </div>
      </div>
      <button
        v-else
        type="button"
        :disabled="!canFinish"
        :title="canFinish ? undefined : '種目を1つ以上追加するか、メモを保存してから完了してください'"
        class="w-full rounded bg-green-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
        @click="onFinishClick"
      >
        今日の記録を完了
      </button>
    </div>
  </div>
</template>
