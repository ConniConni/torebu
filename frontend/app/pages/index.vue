<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

interface WorkoutSetSummary {
  id: string
  exerciseId: string
  setOrder: number
  weightKg: number | null
  reps: number
}

interface ExerciseGroup {
  exerciseId: string
  name: string
  sets: WorkoutSetSummary[]
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

// 一覧(GET /workouts)はsetsを含まないため、各記録の種目・セット内訳は選択された日の分だけ
// 都度detail(GET /workouts/:id)を取って補う。通常は1日1記録想定で件数は少ない
const workoutGroups = ref<Record<string, ExerciseGroup[]>>({})
const summaryPending = ref<Record<string, boolean>>({})

async function loadSummary(workoutId: string) {
  if (workoutGroups.value[workoutId] || summaryPending.value[workoutId]) return
  summaryPending.value[workoutId] = true
  try {
    const detail = await requestFetch<{ sets: WorkoutSetSummary[] }>(`/api/workouts/${workoutId}`)
    // [id].vue・workouts/new.vueと同じ方針：種目ごとにグルーピングし、セット順に並べる
    const byExercise = new Map<string, WorkoutSetSummary[]>()
    for (const set of detail.sets) {
      byExercise.set(set.exerciseId, [...(byExercise.get(set.exerciseId) ?? []), set])
    }
    workoutGroups.value[workoutId] = [...byExercise.entries()].map(([exerciseId, sets]) => ({
      exerciseId,
      name: exerciseName(exerciseId),
      sets: [...sets].sort((a, b) => a.setOrder - b.setOrder),
    }))
  } catch {
    workoutGroups.value[workoutId] = []
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
          <ul v-else class="space-y-3">
            <li
              v-for="workout in selectedWorkouts"
              :key="workout.id"
              class="rounded border border-gray-200 px-3 py-2"
            >
              <NuxtLink
                :to="`/workouts/new?date=${workout.performedAt}`"
                class="block hover:text-blue-600"
              >
                <p v-if="workout.memo" class="mb-1 text-xs text-gray-500">{{ workout.memo }}</p>

                <p v-if="summaryPending[workout.id]" class="text-sm text-gray-500">
                  読み込み中...
                </p>
                <p
                  v-else-if="!workoutGroups[workout.id]?.length"
                  class="text-sm text-gray-500"
                >
                  種目未登録
                </p>
                <div v-else class="space-y-1">
                  <div v-for="group in workoutGroups[workout.id]" :key="group.exerciseId">
                    <p class="text-sm font-medium text-gray-900">{{ group.name }}</p>
                    <p
                      v-for="set in group.sets"
                      :key="set.id"
                      class="flex items-baseline gap-1 pl-2 text-xs text-gray-600 tabular-nums"
                    >
                      <span
                        ><span class="inline-block w-5 text-right">{{ set.setOrder }}</span
                        >セット目：</span
                      >
                      <span>
                        <span class="inline-block w-12 text-right">{{
                          set.weightKg ?? '自重'
                        }}</span
                        >{{ set.weightKg ? 'kg' : '' }}
                      </span>
                      <span>×</span>
                      <span><span class="inline-block w-5 text-right">{{ set.reps }}</span>回</span>
                    </p>
                  </div>
                </div>
              </NuxtLink>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </div>
</template>
