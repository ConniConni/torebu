<script setup lang="ts">
// ⑥ 記録詳細。過去1回分のworkout(日付・メモ)＋workout_sets(種目ごとのセット)を見返す画面
definePageMeta({ middleware: 'auth' })

interface WorkoutSet {
  id: string
  workoutId: string
  exerciseId: string
  setOrder: number
  weightKg: number | null
  reps: number
}
interface WorkoutDetail {
  id: string
  performedAt: string
  memo: string | null
  createdAt: string
  updatedAt: string
  sets: WorkoutSet[]
}

const route = useRoute()
const workoutId = route.params.id as string
const requestFetch = useRequestFetch()

const { exercises, fetchExercises } = useExercises()
if (!exercises.value) {
  await fetchExercises()
}

const workout = ref<WorkoutDetail | null>(null)
const pending = ref(false)
const error = ref(false)

async function fetchWorkout() {
  pending.value = true
  error.value = false
  try {
    workout.value = await requestFetch<WorkoutDetail>(`/api/workouts/${workoutId}`)
  } catch {
    error.value = true
  } finally {
    pending.value = false
  }
}
await fetchWorkout()

function exerciseName(exerciseId: string) {
  return exercises.value?.find((e) => e.id === exerciseId)?.name ?? '(不明な種目)'
}

// workouts/new.vueと同じ方針：種目ごとにグルーピングし、セット順に並べて表示する
const groupedSets = computed(() => {
  if (!workout.value) return []
  const byExercise = new Map<string, WorkoutSet[]>()
  for (const set of workout.value.sets) {
    byExercise.set(set.exerciseId, [...(byExercise.get(set.exerciseId) ?? []), set])
  }
  return [...byExercise.entries()].map(([exerciseId, sets]) => ({
    exerciseId,
    name: exerciseName(exerciseId),
    sets: [...sets].sort((a, b) => a.setOrder - b.setOrder),
  }))
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <NuxtLink to="/" class="text-sm text-gray-500">← ホームに戻る</NuxtLink>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error || !workout" class="text-center text-sm text-red-600">
        記録の取得に失敗しました。時間をおいて再度お試しください
      </p>

      <template v-else>
        <div>
          <h1 class="text-base font-semibold text-gray-900">{{ workout.performedAt }}の記録</h1>
          <p v-if="workout.memo" class="mt-1 text-sm text-gray-600">{{ workout.memo }}</p>
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
              class="text-sm text-gray-700"
            >
              {{ set.setOrder }}セット目：{{ set.weightKg ?? '自重' }}{{ set.weightKg ? 'kg' : '' }} × {{ set.reps }}回
            </li>
          </ul>
        </section>

        <p v-if="groupedSets.length === 0" class="text-center text-sm text-gray-500">
          この記録には種目がありません
        </p>
      </template>
    </div>
  </div>
</template>
