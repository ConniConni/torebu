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

const today = todayLocalDateString()
const selectedDate = ref(today)
const selectedWorkouts = computed(() =>
  (workouts.value ?? []).filter((w) => w.performedAt === selectedDate.value),
)
// 過去日にまだ記録が無いときだけ、その日で③記録作成を始める導線を出す。
// 未来日は③側で今日にクランプされてしまい紛らわしいため対象外
const isPastDate = computed(() => selectedDate.value < today)

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
          <template v-if="selectedWorkouts.length === 0">
            <p class="text-sm text-gray-500">記録がありません</p>
            <NuxtLink
              v-if="isPastDate"
              :to="`/workouts/new?date=${selectedDate}`"
              class="mt-2 block w-full rounded border border-blue-600 py-2 text-center text-sm font-semibold text-blue-600"
            >
              ＋この日の記録を始める
            </NuxtLink>
          </template>
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
                <div v-else class="space-y-2">
                  <!-- ③記録作成・⑤ルーティンのセット表示と見た目を揃えたヘッダー帯付き表形式
                       （ユーザー指摘、2026-09-05）。ここは読み取り専用のプレビューのため
                       入力欄は持たず、値をそのままテキストで表示する。列の下限・横スクロールの
                       考え方は③・⑤と同じ（Issue #95） -->
                  <div v-for="group in workoutGroups[workout.id]" :key="group.exerciseId">
                    <p class="mb-1 text-sm font-medium text-gray-900">{{ group.name }}</p>
                    <div class="overflow-x-auto">
                      <div class="min-w-[15rem] overflow-hidden rounded-lg">
                        <div
                          class="grid grid-cols-[2.75rem_minmax(4rem,1.15fr)_minmax(3rem,0.85fr)] gap-x-2.5 bg-gray-100 px-3 py-1"
                        >
                          <span class="text-xs font-semibold text-gray-500">セット</span>
                          <span class="text-xs font-semibold text-gray-500">重量</span>
                          <span class="text-xs font-semibold text-gray-500">回数</span>
                        </div>
                        <div
                          v-for="(set, i) in group.sets"
                          :key="set.id"
                          class="grid grid-cols-[2.75rem_minmax(4rem,1.15fr)_minmax(3rem,0.85fr)] items-center gap-x-2.5 px-3 py-1"
                          :class="i % 2 === 1 ? 'bg-gray-50' : ''"
                        >
                          <span class="text-center text-sm font-bold tabular-nums text-gray-900">{{
                            set.setOrder
                          }}</span>
                          <span class="text-right text-sm tabular-nums text-gray-900">
                            {{ set.weightKg ?? '自重' }}<span class="ml-1 text-xs text-gray-500">kg</span>
                          </span>
                          <span class="text-right text-sm tabular-nums text-gray-900">
                            {{ set.reps }}<span class="ml-1 text-xs text-gray-500">回</span>
                          </span>
                        </div>
                      </div>
                    </div>
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
