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
const { fetchVolume } = useStats()
const requestFetch = useRequestFetch()

await fetchWorkouts()
if (!exercises.value) {
  await fetchExercises()
}

function exerciseName(exerciseId: string) {
  return exercises.value?.find((e) => e.id === exerciseId)?.name ?? '(不明な種目)'
}

// カレンダーの印を「セットを1件以上記録した日」と「メモのみの日」で分ける（Issue #99）。
// hasSetsはGET /workoutsのレスポンスに含まれる（backend/src/routes/workouts.ts参照）
const recordedDates = computed(
  () => new Set((workouts.value ?? []).filter((w) => w.hasSets).map((w) => w.performedAt)),
)
const memoOnlyDates = computed(
  () => new Set((workouts.value ?? []).filter((w) => !w.hasSets).map((w) => w.performedAt)),
)

const today = todayLocalDateString()

// 今月／通算の記録日数（Phase3-B）。hasSetsを問わず「記録がある日」であれば対象にする
// （docs/spec.md参照。frontend/app/utils/trainingDays.ts参照）
const allRecordedDates = computed(() => (workouts.value ?? []).map((w) => w.performedAt))
const trainingDaysThisMonth = computed(() =>
  countTrainingDaysInMonth(allRecordedDates.value, today),
)
const totalTrainingDays = computed(() => countTotalTrainingDays(allRecordedDates.value))

// 今週のサマリー（合計負荷重量・トレ日数、Phase3-D）。新規バックエンドAPIは作らず、
// 既存GET /stats/volume（range=1mで直近4〜5週をカバー）をフロントで週集計する。
// トレ日数は今月/通算と同じallRecordedDatesを流用する（frontend/app/utils/weeklySummary.ts参照）
const weeklyVolumePoints = ref<{ date: string; volumeKg: number }[]>([])
const weeklyVolumePending = ref(true)
const weeklyVolumeError = ref(false)
try {
  weeklyVolumePoints.value = await fetchVolume('1m')
} catch {
  weeklyVolumeError.value = true
} finally {
  weeklyVolumePending.value = false
}
const weeklyVolumeKg = computed(() => sumWeeklyVolume(weeklyVolumePoints.value, today))
const weeklyTrainingDays = computed(() =>
  countWeeklyTrainingDays(allRecordedDates.value, today),
)

// 週別推移（直近4週間、横棒グラフ）。今週を一番上に表示するため表示直前でreverseする
// （weeklyVolumeTrend自体は古い週→新しい週の時系列順を返す。値ラベルは出さず、
// バーの長さのみで比較させる形をモックで比較して決定、2026-09-08）
const weeklyVolumeTrendPoints = computed(() => weeklyVolumeTrend(weeklyVolumePoints.value, today))
const weeklyVolumeTrendDisplay = computed(() => [...weeklyVolumeTrendPoints.value].reverse())
const weeklyVolumeTrendMax = computed(() =>
  Math.max(1, ...weeklyVolumeTrendPoints.value.map((p) => p.volumeKg)),
)

const selectedDate = ref(today)
const selectedWorkouts = computed(() =>
  (workouts.value ?? []).filter((w) => w.performedAt === selectedDate.value),
)
// 今日・過去日にまだ記録が無いときだけ、その日で③記録作成を始める導線を出す。
// 未来日は③側で今日にクランプされてしまい紛らわしいため対象外（Issue #99で今日も対象に含めた。
// 以前は過去日のみだったが、今日を選択した場合だけ導線が出ないのは不自然という指摘を受けた）
const isTodayOrPastDate = computed(() => selectedDate.value <= today)

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
        ＋今日の記録をつける
      </button>

      <NuxtLink
        to="/routines"
        class="w-full rounded border border-blue-600 py-2 text-center text-sm font-semibold text-blue-600"
      >
        ルーティン一覧
      </NuxtLink>

      <NuxtLink
        to="/stats"
        class="w-full rounded border border-blue-600 py-2 text-center text-sm font-semibold text-blue-600"
      >
        統計
      </NuxtLink>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error" class="text-center text-sm text-red-600">
        記録の取得に失敗しました。時間をおいて再度お試しください
      </p>

      <template v-else>
        <div
          class="flex items-center justify-around rounded-lg border border-blue-100 bg-blue-50 py-2.5 text-xs text-blue-900"
        >
          <p>
            今月<span class="text-base font-extrabold tabular-nums text-blue-700">{{
              trainingDaysThisMonth
            }}</span
            >日
          </p>
          <p>
            通算<span class="text-base font-extrabold tabular-nums text-blue-700">{{
              totalTrainingDays
            }}</span
            >日
          </p>
        </div>

        <!-- 今週のサマリー（Phase3-D）。今月/通算の記録日数帯のすぐ下に置き、「継続」の文脈を
             まとめる。集計元は既存GET /stats/volume（フロントで週集計、weeklySummary.ts参照）で、
             このAPI呼び出しだけ失敗しても他の表示は妨げないよう独立してエラー処理する。
             2カードを横並びにし、左に今週の数値、右に直近4週間の推移（横棒グラフ）を置く
             （中身・レイアウト・グラフ形式はモックで複数パターンを比較して決定） -->
        <p v-if="weeklyVolumePending" class="text-xs text-gray-400">今週のサマリーを読み込み中...</p>
        <p v-else-if="weeklyVolumeError" class="text-xs text-red-600">
          今週のサマリーの取得に失敗しました
        </p>
        <div v-else class="flex gap-3">
          <div class="flex-1 rounded-lg border border-gray-200 bg-white p-3">
            <p class="mb-2 text-xs font-semibold text-gray-500">今週のサマリー</p>
            <div class="flex flex-col gap-2">
              <div>
                <p class="text-2xl font-extrabold leading-none tabular-nums text-blue-700">
                  {{ weeklyVolumeKg.toLocaleString()
                  }}<span class="ml-1 text-sm font-medium text-gray-700">kg</span>
                </p>
                <p class="mt-1 text-xs text-gray-500">合計負荷重量</p>
              </div>
              <div>
                <p class="text-2xl font-extrabold leading-none tabular-nums text-blue-700">
                  {{ weeklyTrainingDays
                  }}<span class="ml-1 text-sm font-medium text-gray-700">日</span>
                </p>
                <p class="mt-1 text-xs text-gray-500">トレ日数</p>
              </div>
            </div>
          </div>
          <div class="flex-1 rounded-lg border border-gray-200 bg-white p-3">
            <p class="mb-3 text-xs font-semibold text-gray-500">週別推移</p>
            <div class="flex flex-col gap-2.5">
              <div
                v-for="point in weeklyVolumeTrendDisplay"
                :key="point.weekStart"
                class="flex items-center gap-2"
              >
                <p
                  class="w-9 shrink-0 text-[10px] leading-none"
                  :class="point.label === '今週' ? 'font-semibold text-blue-700' : 'text-gray-500'"
                >
                  {{ point.label }}
                </p>
                <!-- 空トラック（背景の薄いバー）は出さず、実際の値がある分だけ棒を描く
                     （ユーザー指摘、2026-09-08：記録の有無を問わず薄い表示は不要） -->
                <div class="h-3 flex-1">
                  <div
                    v-if="point.volumeKg > 0"
                    class="h-3 rounded-full bg-blue-600"
                    :class="point.label === '今週' ? '' : 'opacity-40'"
                    :style="{
                      width: `${Math.max(4, Math.round((point.volumeKg / weeklyVolumeTrendMax) * 100))}%`,
                    }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <HomeCalendar
          :recorded-dates="recordedDates"
          :memo-only-dates="memoOnlyDates"
          :selected-date="selectedDate"
          @select="onSelectDate"
        />

        <div class="rounded-lg bg-white p-4 shadow">
          <p class="mb-2 text-sm font-semibold text-gray-900">{{ selectedDate }}の記録</p>
          <template v-if="selectedWorkouts.length === 0">
            <p class="text-sm text-gray-500">記録がありません</p>
            <NuxtLink
              v-if="isTodayOrPastDate"
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

                <p v-if="summaryPending[workout.id]" class="text-sm text-gray-500">読み込み中...</p>
                <!-- セット0件（メモのみ）の記録は、カード自体が③記録作成へのリンクになっている
                     ことを踏まえ、「＋この日の記録を始める」等の既存の能動的な文言と語彙を揃えた
                     表現にする（Issue #99。以前の「種目未登録」は受動的で分かりにくいという指摘） -->
                <p
                  v-else-if="!workoutGroups[workout.id]?.length"
                  class="text-sm font-medium text-blue-600"
                >
                  ＋種目を記録する
                </p>
                <div v-else class="space-y-2">
                  <!-- ③記録作成・⑤ルーティンのセット表示と見た目を揃えたヘッダー帯付き表形式
                       （ユーザー指摘、2026-09-05）。ここは読み取り専用のプレビューのため
                       入力欄は持たず、値をそのままテキストで表示する。列の下限・横スクロールの
                       考え方は③・⑤と同じ（Issue #95）。値と単位（kg・回）を別要素に分けているのも
                       ③・⑤に合わせた対応（Issue #97）：単に連結すると「自重」の文字幅が数値と
                       異なるため、行によって「kg」「回」の位置がずれて見えてしまう。
                       なお自重（weightKg===null）のときは「自重kg」という不自然な表記になるのを
                       避けるため単位（kg）自体を表示しない（③・⑤は入力欄＋固定の単位ラベルという
                       別のUIのためこの対応は不要、ユーザー指摘2026-09-06） -->
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
                          <span class="flex min-w-0 items-baseline justify-end gap-1">
                            <span
                              class="min-w-0 truncate text-right text-sm tabular-nums text-gray-900"
                              >{{ set.weightKg ?? '自重' }}</span
                            >
                            <span
                              v-if="set.weightKg !== null"
                              class="shrink-0 text-xs text-gray-500"
                              >kg</span
                            >
                          </span>
                          <span class="flex min-w-0 items-baseline justify-end gap-1">
                            <span
                              class="min-w-0 truncate text-right text-sm tabular-nums text-gray-900"
                              >{{ set.reps }}</span
                            >
                            <span class="shrink-0 text-xs text-gray-500">回</span>
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
