<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

interface WorkoutSetSummary {
  exerciseId: string
}

const { user, logout } = useAuth()
const { workouts, pending, error, fetchWorkouts } = useWorkouts()
const { exercises, fetchExercises } = useExercises()
const requestFetch = useRequestFetch()

await fetchWorkouts()
if (!exercises.value) {
  await fetchExercises()
}

function exerciseName(exerciseId: string) {
  return exercises.value?.find((e) => e.id === exerciseId)?.name ?? '(不明な種目)'
}

const markedDates = computed(() => new Set((workouts.value ?? []).map((w) => w.performedAt)))

const selectedDate = ref(todayLocalDateString())
const selectedWorkouts = computed(() =>
  (workouts.value ?? []).filter((w) => w.performedAt === selectedDate.value),
)

function onSelectDate(date: string) {
  selectedDate.value = date
}

// 一覧(GET /workouts)はsetsを含まないため、各記録のセット済み種目名は選択された日の分だけ
// 都度detail(GET /workouts/:id)を取って補う。通常は1日1記録想定で件数は少ない
const workoutExerciseNames = ref<Record<string, string[]>>({})
const summaryPending = ref<Record<string, boolean>>({})

async function loadSummary(workoutId: string) {
  if (workoutExerciseNames.value[workoutId] || summaryPending.value[workoutId]) return
  summaryPending.value[workoutId] = true
  try {
    const detail = await requestFetch<{ sets: WorkoutSetSummary[] }>(`/api/workouts/${workoutId}`)
    const seen = new Set<string>()
    const names: string[] = []
    for (const set of detail.sets) {
      if (!seen.has(set.exerciseId)) {
        seen.add(set.exerciseId)
        names.push(exerciseName(set.exerciseId))
      }
    }
    workoutExerciseNames.value[workoutId] = names
  } catch {
    workoutExerciseNames.value[workoutId] = []
  } finally {
    summaryPending.value[workoutId] = false
  }
}

watch(
  selectedWorkouts,
  (list) => {
    for (const workout of list) loadSummary(workout.id)
  },
  { immediate: true },
)

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-900">{{ user?.displayName }}さん</p>
        <button
          type="button"
          class="rounded bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-300"
          @click="onLogout"
        >
          ログアウト
        </button>
      </div>

      <button
        type="button"
        class="w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white"
        @click="navigateTo('/workouts/new')"
      >
        ＋今日の記録を始める
      </button>

      <NuxtLink
        to="/routines"
        class="w-full rounded border border-blue-600 py-2 text-center text-sm font-semibold text-blue-600"
      >
        ルーティン一覧
      </NuxtLink>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error" class="text-center text-sm text-red-600">
        記録の取得に失敗しました。時間をおいて再度お試しください
      </p>

      <template v-else>
        <HomeCalendar
          :marked-dates="markedDates"
          :selected-date="selectedDate"
          @select="onSelectDate"
        />

        <div class="rounded-lg bg-white p-4 shadow">
          <p class="mb-2 text-sm font-semibold text-gray-900">{{ selectedDate }}の記録</p>
          <p v-if="selectedWorkouts.length === 0" class="text-sm text-gray-500">記録がありません</p>
          <ul v-else class="space-y-2">
            <li v-for="workout in selectedWorkouts" :key="workout.id">
              <NuxtLink
                :to="`/workouts/${workout.id}`"
                class="block rounded border border-gray-200 bg-white px-3 py-2 hover:border-blue-300 hover:bg-blue-50"
              >
                <p class="text-sm font-medium text-gray-900">
                  <template v-if="workoutExerciseNames[workout.id]?.length">{{
                    workoutExerciseNames[workout.id]!.join('、')
                  }}</template>
                  <template v-else-if="summaryPending[workout.id]">読み込み中...</template>
                  <template v-else>種目未登録</template>
                </p>
                <p v-if="workout.memo" class="mt-1 text-xs text-gray-500">{{ workout.memo }}</p>
              </NuxtLink>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </div>
</template>
