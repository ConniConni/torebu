<script setup lang="ts">
// ②ホーム画面の中身。index.vue（`/`）はログイン中かどうかで表示を出し分けるため
// （ログイン中はここ、未ログインはWelcomeScreen）、v-ifで条件付きマウントされたときだけ
// 中のfetch系処理が走るようこのコンポーネントに切り出した（Issue #151）
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
const { unreadCount, fetchUnreadCount } = useNotifications()
await fetchUnreadCount()
const { workouts, pending, error, fetchWorkouts, deleteWorkout } = useWorkouts()
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

// 通算の記録日数（Phase3-B）。hasSetsを問わず「記録がある日」であれば対象にする
// （docs/spec.md参照。frontend/app/utils/trainingDays.ts参照）
const allRecordedDates = computed(() => (workouts.value ?? []).map((w) => w.performedAt))
const totalTrainingDays = computed(() => countTotalTrainingDays(allRecordedDates.value))

// 合計負荷重量（期間別サマリーカード、Issue #169）。新規バックエンドAPIは
// 作らず、既存GET /stats/volume（range=all）をフロントで直近7日/直近28日/全期間に集計する。
// range=allにしているのは、直近28日/通算分（Issue #169で追加）が28日前〜現在・全期間の合計を
// 必要とし、週別推移用のrange=1mだけでは足りないため。トレ日数も同じallRecordedDatesを流用する
// （frontend/app/utils/trainingDays.ts・trainingVolume.ts参照）
const volumePoints = ref<{ date: string; volumeKg: number }[]>([])
const weeklyVolumePending = ref(true)
const weeklyVolumeError = ref(false)

async function loadWeeklyVolume() {
  weeklyVolumePending.value = true
  weeklyVolumeError.value = false
  try {
    volumePoints.value = await fetchVolume('all')
  } catch {
    weeklyVolumeError.value = true
  } finally {
    weeklyVolumePending.value = false
  }
}
await loadWeeklyVolume()

// 期間別サマリーカード（直近7日/直近28日/通算、Issue #169）。以前は「今月/通算の記録日数帯」と
// 「今週のサマリー」が別々のカードだったが、見た目の言語が2種類に分かれて不自然という指摘を受け、
// 1枚のカードで期間をタブ切り替えする形に統合した（モックで複数案を比較して決定）。
// 合計負荷重量はkgではなくt表記にする（桁が減って見やすい、2026-09-10決定。frontend/app/utils/
// weightDisplay.ts参照）。あわせて「0.8t」だけだと実感が湧きにくいため、海の生き物の体重に
// 例えるキャプション（動物換算）を添える。
// 「今週」「今月」は当初、日曜始まりの暦週／暦月（1日〜今日）だったが、「実態と違う」という
// 指摘を受け、今日起算のローリング期間（直近7日間／直近28日間）に変更した（2026-09-11）。
// 文言もそれに合わせて「直近7日」「直近28日」にする。なお週別推移カード（下記
// weeklyVolumeTrendPoints）は「◯週前」ラベルとの整合のため暦週の定義のまま据え置いており、
// 画面内で期間の定義が二重になる点は許容した上での判断（frontend/app/utils/weeklySummary.ts参照）
type SummaryPeriod = 'recent7' | 'recent28' | 'total'
const PERIODS: { key: SummaryPeriod; label: string }[] = [
  { key: 'recent7', label: '直近7日' },
  { key: 'recent28', label: '直近28日' },
  { key: 'total', label: '通算' },
]
const selectedPeriod = ref<SummaryPeriod>('recent7')
const periodStats = computed<Record<SummaryPeriod, { volumeKg: number; days: number }>>(() => ({
  recent7: {
    volumeKg: sumRecentVolume(volumePoints.value, today, 7),
    days: countRecentTrainingDays(allRecordedDates.value, today, 7),
  },
  recent28: {
    volumeKg: sumRecentVolume(volumePoints.value, today, 28),
    days: countRecentTrainingDays(allRecordedDates.value, today, 28),
  },
  total: { volumeKg: sumTotalVolume(volumePoints.value), days: totalTrainingDays.value },
}))
const activeStats = computed(() => periodStats.value[selectedPeriod.value])
const activeAnimalCaption = computed(() => animalCaption(activeStats.value.volumeKg))

// 週別推移（直近5週間、横棒グラフ）。今週を一番上に表示するため表示直前でreverseする
// （weeklyVolumeTrend自体は古い週→新しい週の時系列順を返す。値ラベルは出さず、
// バーの長さのみで比較させる形をモックで比較して決定、2026-09-08。
// 4週間だと隣の期間別サマリーカードより短くなり余白ができるため5週間に変更、2026-09-11）
const weeklyVolumeTrendPoints = computed(() => weeklyVolumeTrend(volumePoints.value, today, 5))
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

// 記録本体の削除（Issue #127で③記録本体画面から移設）。③の画面内で見た目上「ホームへ戻る」と
// 隣り合っていたのが紛らわしいという指摘を受け、削除操作自体を②の記録カード側に寄せた。
// 削除UIの見た目は⑤ルーティン一覧の本体削除（Issue #93）に合わせる：一覧の行内で
// 2段階確認（キャンセル／削除するボタン）をその場に展開する方式
const confirmingDeleteId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const deleteError = ref('')

async function onDeleteWorkout(id: string) {
  deletingId.value = id
  deleteError.value = ''
  try {
    await deleteWorkout(id)
    confirmingDeleteId.value = null
    // 以前は③記録本体画面から削除すると必ずホームへ遷移し、その際のページ再マウントで
    // サマリー（volumePoints、GET /stats/volume由来）も自然に取り直されていた。
    // ②に移設して画面遷移を伴わなくなった分、ここで明示的に再取得しないと削除前の古いkg値が
    // 残ってしまう（periodStatsのdaysはworkoutsから直接computedしているため対象外。
    // volumeKgはperiodStats内でvolumePointsから計算されるためここで一緒に更新される。
    // Issue #116と同種のキャッシュ更新漏れパターン、CLAUDE.mdのセルフチェック項目参照）
    await loadWeeklyVolume()
  } catch {
    deleteError.value = '記録の削除に失敗しました。時間をおいて再度お試しください'
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6 pb-24">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-900">{{ user?.displayName }}さん</p>
        <div class="flex items-center gap-2">
          <NuxtLink
            to="/notifications"
            class="relative flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700"
            aria-label="通知"
          >
            <BellIcon class="h-4.5 w-4.5" />
            <span
              v-if="unreadCount > 0"
              class="absolute -top-1 -right-1 min-w-[1rem] rounded-full border-2 border-gray-50 bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white"
            >
              {{ unreadCount > 9 ? '9+' : unreadCount }}
            </span>
          </NuxtLink>
          <button
            type="button"
            class="rounded bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-300"
            @click="onLogout"
          >
            ログアウト
          </button>
        </div>
      </div>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error" class="text-center text-sm text-red-600">
        記録の取得に失敗しました。時間をおいて再度お試しください
      </p>

      <template v-else>
        <!-- 期間別サマリーカード（今週/今月/通算、Issue #169）。旧「今月/通算の記録日数帯」+
             「今週のサマリー」の2種類のカードを1枚に統合した（モックで複数案を比較して決定。
             経緯はdocs/spec.md参照）。このAPI呼び出し（GET /stats/volume）だけ失敗しても
             他の表示は妨げないよう独立してエラー処理する -->
        <p v-if="weeklyVolumePending" class="text-xs text-gray-400">サマリーを読み込み中...</p>
        <p v-else-if="weeklyVolumeError" class="text-xs text-red-600">
          サマリーの取得に失敗しました
        </p>
        <div v-else class="flex gap-3">
          <div class="flex-1 rounded-lg border border-gray-200 bg-white p-3">
            <div class="mb-2.5 flex gap-1">
              <button
                v-for="period in PERIODS"
                :key="period.key"
                type="button"
                class="flex-1 rounded py-1 text-[10px] font-bold"
                :class="
                  selectedPeriod === period.key
                    ? 'bg-brand-700 text-white'
                    : 'bg-transparent text-gray-400'
                "
                @click="selectedPeriod = period.key"
              >
                {{ period.label }}
              </button>
            </div>
            <div class="flex flex-col gap-2">
              <div>
                <p class="text-2xl font-extrabold leading-none tabular-nums text-brand-700">
                  {{ formatTons(activeStats.volumeKg) }}
                </p>
                <div v-if="activeAnimalCaption" class="mt-1 flex items-center gap-1.5">
                  <!-- 表示順は「負荷重量 イラスト×倍数」（2026-09-11、初見で意味が伝わりづらい
                       という指摘を受けた文言修正）。アイコンは「約◯匹(頭)分」→「×◯」に
                       短縮した分の余白でひとまわり大きくしている（クジラの視認性が悪いという
                       指摘、2026-09-11）。ラベル・アイコンはshrink-0+whitespace-nowrapで、
                       右の倍数（幅固定）に押されて折り返さないようにする -->
                  <span class="shrink-0 whitespace-nowrap text-xs font-semibold text-gray-500"
                    >負荷重量</span
                  >
                  <SeaAnimalIcon
                    :name="activeAnimalCaption.animalKey"
                    :alt="activeAnimalCaption.animalName"
                    class="h-6 w-9 shrink-0"
                  />
                  <!-- 倍数はタブ（直近7日/直近28日/通算）を切り替えるたびに桁数が変わりうるが、
                       それによってラベルやイラストの位置がずれないよう、幅を最大6桁
                       （×99999.9想定）分で固定しtabular-numsで揃える（2026-09-11）。
                       カード幅が狭いため、想定を超える桁数（7桁以上）のときだけ稀にカード端から
                       はみ出す可能性があるが許容する -->
                  <span
                    class="w-16 shrink-0 whitespace-nowrap text-left text-xs font-semibold tabular-nums text-gray-500"
                  >
                    × {{ activeAnimalCaption.multiplierText }}
                  </span>
                </div>
                <p v-else class="mt-1 text-xs text-gray-500">負荷重量</p>
              </div>
              <div>
                <p class="text-2xl font-extrabold leading-none tabular-nums text-brand-700">
                  {{ activeStats.days
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
                  :class="point.label === '今週' ? 'font-semibold text-brand-700' : 'text-gray-500'"
                >
                  {{ point.label }}
                </p>
                <!-- 空トラック（背景の薄いバー）は出さず、実際の値がある分だけ棒を描く
                     （ユーザー指摘、2026-09-08：記録の有無を問わず薄い表示は不要） -->
                <div class="h-3 flex-1">
                  <div
                    v-if="point.volumeKg > 0"
                    class="h-3 rounded-full bg-brand-600"
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
              class="mt-2 block w-full rounded border border-brand-600 py-2 text-center text-sm font-semibold text-brand-600"
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
              <template v-if="confirmingDeleteId === workout.id">
                <p class="text-sm text-gray-700">この記録を削除しますか？元に戻せません。</p>
                <div class="mt-2 flex gap-2">
                  <button
                    type="button"
                    :disabled="deletingId === workout.id"
                    class="flex-1 rounded border border-gray-300 py-1.5 text-sm text-gray-700 disabled:opacity-50"
                    @click="confirmingDeleteId = null"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    :disabled="deletingId === workout.id"
                    class="flex-1 rounded bg-red-600 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    @click="onDeleteWorkout(workout.id)"
                  >
                    {{ deletingId === workout.id ? '削除中...' : '削除する' }}
                  </button>
                </div>
                <p v-if="deleteError" class="mt-2 text-sm text-red-600">{{ deleteError }}</p>
              </template>
              <div v-else class="flex items-start gap-2">
                <NuxtLink
                  :to="`/workouts/new?date=${workout.performedAt}`"
                  class="block flex-1 hover:text-brand-600"
                >
                  <p v-if="workout.memo" class="mb-1 text-xs text-gray-500">{{ workout.memo }}</p>

                  <p v-if="summaryPending[workout.id]" class="text-sm text-gray-500">
                    読み込み中...
                  </p>
                  <!-- セット0件（メモのみ）の記録は、カード自体が③記録作成へのリンクになっている
                     ことを踏まえ、「＋この日の記録を始める」等の既存の能動的な文言と語彙を揃えた
                     表現にする（Issue #99。以前の「種目未登録」は受動的で分かりにくいという指摘） -->
                  <p
                    v-else-if="!workoutGroups[workout.id]?.length"
                    class="text-sm font-medium text-brand-600"
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
                            <span
                              class="text-center text-sm font-bold tabular-nums text-gray-900"
                              >{{ set.setOrder }}</span
                            >
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
                <button
                  type="button"
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600"
                  aria-label="この記録を削除する"
                  @click="confirmingDeleteId = workout.id"
                >
                  <TrashIcon class="h-4 w-4" />
                </button>
              </div>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </div>
</template>
