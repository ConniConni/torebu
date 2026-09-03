<script setup lang="ts">
// ⑦ 種目追加。④種目選択の「＋種目を追加」から遷移する共通画面（部位は遷移元のセクションを引き継ぐ）
// 選択後にどこへ戻るかは④と同じくクエリパラメータreturnTo(未指定なら③記録作成)で決める
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const returnTo = computed(() =>
  typeof route.query.returnTo === 'string' ? route.query.returnTo : '/workouts/new',
)
const { createExercise } = useExercises()

const defaultMuscleGroup = MUSCLE_GROUPS.includes(route.query.muscleGroup as MuscleGroup)
  ? (route.query.muscleGroup as MuscleGroup)
  : 'chest'

const name = ref('')
const muscleGroup = ref<MuscleGroup>(defaultMuscleGroup)
const submitting = ref(false)
const errorMessage = ref('')

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
