<script setup lang="ts">
// ⑦ 種目追加。④種目選択の「＋種目を追加」から遷移する共通画面（部位は遷移元のセクションを引き継ぐ）
// 選択後にどこへ戻るかは④と同じくクエリパラメータreturnTo(未指定なら③記録作成)で決める
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const returnTo = computed(() =>
  typeof route.query.returnTo === 'string' ? route.query.returnTo : '/workouts/new',
)
const { exercises, createExercise, fetchExercises } = useExercises()
if (!exercises.value) {
  await fetchExercises()
}

const defaultMuscleGroup = MUSCLE_GROUPS.includes(route.query.muscleGroup as MuscleGroup)
  ? (route.query.muscleGroup as MuscleGroup)
  : 'chest'

const name = ref('')
const muscleGroup = ref<MuscleGroup>(defaultMuscleGroup)
const submitting = ref(false)
const errorMessage = ref('')

// 表記ゆれ（スペース・中点・大文字小文字）を吸収した部分一致で、登録前に本人へ重複候補を気づかせる。
// DB制約による禁止はせず、この表示だけで防ぐ方針(docs/schema.md参照)なので登録自体はブロックしない
const SIMILAR_NAME_MIN_LENGTH = 2
const similarExercises = computed(() => {
  const normalizedInput = normalizeExerciseName(name.value)
  if (normalizedInput.length < SIMILAR_NAME_MIN_LENGTH) return []
  return (exercises.value ?? []).filter((exercise) => {
    const normalizedExisting = normalizeExerciseName(exercise.name)
    return normalizedExisting.includes(normalizedInput) || normalizedInput.includes(normalizedExisting)
  })
})

async function selectSimilarExercise(exerciseId: string) {
  // 新規登録はせず、選んだ既存種目を選択済みにしてreturnToへ戻る(通常の選択・追加と同じ動線)
  usePickedExerciseId().value = exerciseId
  await navigateTo(returnTo.value)
}

async function onSubmit() {
  if (!name.value.trim()) return
  submitting.value = true
  errorMessage.value = ''
  try {
    const exercise = await createExercise({ name: name.value.trim(), muscleGroup: muscleGroup.value })
    // 追加した種目をそのまま選択済みにしてreturnTo(③記録作成・⑤ルーティン編集など)へ戻る(④を経由し直させない)
    usePickedExerciseId().value = exercise.id
    await navigateTo(returnTo.value)
  } catch {
    errorMessage.value = '種目の追加に失敗しました。時間をおいて再度お試しください'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <NuxtLink
        :to="{ path: '/workouts/exercises', query: { returnTo } }"
        class="text-sm text-gray-500"
      >
        ← 種目選択に戻る
      </NuxtLink>
      <h1 class="text-base font-semibold text-gray-900">種目を追加</h1>

      <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <label class="flex flex-col gap-1 text-sm text-gray-700">
          部位
          <select v-model="muscleGroup" class="rounded border border-gray-300 px-3 py-2 text-sm">
            <option v-for="group in MUSCLE_GROUPS" :key="group" :value="group">
              {{ muscleGroupLabel(group) }}
            </option>
          </select>
        </label>

        <label class="flex flex-col gap-1 text-sm text-gray-700">
          種目名
          <input
            v-model="name"
            type="text"
            maxlength="50"
            placeholder="例：インクラインダンベルプレス"
            class="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <div v-if="similarExercises.length > 0" class="rounded border border-amber-300 bg-amber-50 p-3">
          <p class="text-xs text-amber-800">似た名前の種目がすでにあります</p>
          <ul class="mt-1 space-y-1">
            <li v-for="exercise in similarExercises" :key="exercise.id">
              <button
                type="button"
                class="w-full rounded px-2 py-1 text-left text-sm text-amber-900 hover:bg-amber-100"
                @click="selectSimilarExercise(exercise.id)"
              >
                {{ exercise.name }}
              </button>
            </li>
          </ul>
        </div>

        <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

        <button
          type="submit"
          :disabled="!name.trim() || submitting"
          class="w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          追加する
        </button>
      </form>
    </div>
  </div>
</template>
