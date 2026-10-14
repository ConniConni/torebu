<script setup lang="ts">
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  LineController,
  Tooltip,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import type { CardioHistoryPoint, ExerciseHistoryPoint, StatsRange } from '~/composables/useStats'
import { formatPaceTick, type LineChartData } from '~/utils/statsChart'

definePageMeta({ middleware: 'auth', layout: 'tabbar' })

// Chart.js is tree-shakeable: 使う要素だけ明示的に登録する必要がある
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Tooltip,
  Legend,
)

const RANGES: { value: StatsRange; label: string }[] = [
  { value: '1m', label: '1ヶ月' },
  { value: '3m', label: '3ヶ月' },
  { value: 'all', label: '全期間' },
]

const { fetchVolume, fetchExerciseHistory } = useStats()
const { exercises, fetchExercises } = useExercises()
if (!exercises.value) {
  await fetchExercises()
}

// 集計対象は公式種目のみ（backend/src/routes/stats.ts参照）。カスタム種目・削除済みは選択肢に出さない。
// 有酸素は重量×回数ではなく距離・ペース（バイクは時速）の推移を出す（Issue #352）
const officialExercises = computed(
  () => exercises.value?.filter((e) => e.createdBy === null && !e.deletedAt) ?? [],
)
const strengthExercises = computed(() =>
  officialExercises.value.filter((e) => e.muscleGroup !== 'cardio'),
)
const cardioExercises = computed(() =>
  officialExercises.value.filter((e) => e.muscleGroup === 'cardio'),
)
const selectedExercise = computed(() =>
  officialExercises.value.find((e) => e.id === selectedExerciseId.value),
)
const isCardioSelected = computed(() => selectedExercise.value?.muscleGroup === 'cardio')
const isKmhSelected = computed(() => selectedExercise.value?.speedUnit === 'kmh')

const range = ref<StatsRange>('3m')
const selectedExerciseId = ref<string>('')
// 初期選択は筋トレの先頭（有酸素ではなく従来どおりの表示から始める）
watchEffect(() => {
  if (!selectedExerciseId.value && officialExercises.value.length > 0) {
    selectedExerciseId.value = (strengthExercises.value[0] ?? officialExercises.value[0])!.id
  }
})

const volumePending = ref(false)
const volumeError = ref(false)
const volumeChartData = ref(toLineChartData([], '合計負荷重量(kg)'))

async function loadVolume() {
  volumePending.value = true
  volumeError.value = false
  try {
    const points = await fetchVolume(range.value)
    volumeChartData.value = toLineChartData(
      points.map((p) => ({ date: p.date, value: p.volumeKg })),
      '合計負荷重量(kg)',
    )
  } catch {
    volumeError.value = true
  } finally {
    volumePending.value = false
  }
}

const historyPending = ref(false)
const historyError = ref(false)
const estimated1RmChartData = ref(toLineChartData([], '推定1RM(kg)'))
const maxWeightChartData = ref(toLineChartData([], '最大重量(kg)'))
const historyVolumeChartData = ref(toLineChartData([], '合計負荷重量(kg)'))
const distanceChartData = ref(toLineChartData([], '距離(km)'))
const speedChartData = ref(toLineChartData([], 'ペース(分/km)'))
// 取得中に種目が切り替わったとき、遅れて返った古い結果で上書きしないための印
let historyRequestSeq = 0

async function loadHistory() {
  if (!selectedExerciseId.value) return
  const seq = ++historyRequestSeq
  const exercise = selectedExercise.value
  historyPending.value = true
  historyError.value = false
  try {
    const result = await fetchExerciseHistory(selectedExerciseId.value, range.value)
    if (seq !== historyRequestSeq) return
    if (exercise?.muscleGroup === 'cardio') {
      const cardioPoints = result as CardioHistoryPoint[]
      const isKmh = exercise.speedUnit === 'kmh'
      distanceChartData.value = toLineChartData(
        cardioPoints.map((p) => ({ date: p.date, value: p.distanceKm })),
        '距離(km)',
      )
      speedChartData.value = toLineChartData(
        cardioPoints.map((p) => ({ date: p.date, value: isKmh ? p.speedKmh : p.paceSecPerKm })),
        isKmh ? '時速(km/h)' : 'ペース(分/km)',
      )
      return
    }
    const points = result as ExerciseHistoryPoint[]
    // 推定1RMは対象セットが無い日(13回以上だけ等)がnullで返る。0として描かないよう、その日は点ごと除く
    estimated1RmChartData.value = toLineChartData(
      points.flatMap((p) =>
        p.estimated1RmKg === null ? [] : [{ date: p.date, value: p.estimated1RmKg }],
      ),
      '推定1RM(kg)',
    )
    maxWeightChartData.value = toLineChartData(
      points.map((p) => ({ date: p.date, value: p.maxWeightKg })),
      '最大重量(kg)',
    )
    historyVolumeChartData.value = toLineChartData(
      points.map((p) => ({ date: p.date, value: p.volumeKg })),
      '合計負荷重量(kg)',
    )
  } catch {
    if (seq === historyRequestSeq) historyError.value = true
  } finally {
    if (seq === historyRequestSeq) historyPending.value = false
  }
}

watch(range, () => {
  loadVolume()
  loadHistory()
})
// immediate: trueが必要。selectedExerciseIdの初期値は上のwatchEffectでこのwatch登録より前に
// 同期的にセットされるため、immediateなしだとその初回セットをwatchが検知できず、
// ページを開いた直後(=自動選択された種目)はloadHistory()が一度も呼ばれないまま
// 「この期間の記録がありません」の初期状態で放置されてしまう(Issue #126)
watch(selectedExerciseId, loadHistory, { immediate: true })
await loadVolume()

// Chart.jsはcanvas描画のためTailwindのdark:バリアントが効かず、テーマに応じた色を
// options・datasetに明示的に渡す必要がある（Issue #241）。useThemeのtheme（'light'|'dark'）を
// 見て、軸ラベル・グリッド線・線グラフ本体の色を出し分ける。線の色はダークモードのみ
// アクセントのライム(#c8ff4d、WelcomeScreen.vue/Issue #239で導入した値)に変更し視認性を上げる。
// ライト側は元々Chart.jsの既定色に任せていたため、そこは変更しない
const { theme } = useTheme()
const isDarkTheme = computed(() => theme.value === 'dark')

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: isDarkTheme.value ? '#a3a29b' : undefined },
    },
  },
  scales: {
    x: {
      ticks: { color: isDarkTheme.value ? '#a3a29b' : undefined },
      grid: { color: isDarkTheme.value ? 'rgba(255,255,255,0.08)' : undefined },
    },
    y: {
      ticks: { color: isDarkTheme.value ? '#a3a29b' : undefined },
      grid: { color: isDarkTheme.value ? 'rgba(255,255,255,0.08)' : undefined },
    },
  },
}))

// ペース（秒/km）は小さいほど速いので軸を反転して上ほど速い向きにそろえる（時速は大きいほど速いので反転しない）。
// ペースのグラフだけ、軸（反転）と目盛り・ツールチップの「分:秒」表示が違う
const paceChartOptions = computed(() => ({
  ...chartOptions.value,
  plugins: {
    ...chartOptions.value.plugins,
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
          `${ctx.dataset.label}: ${ctx.parsed.y === null ? '-' : `${formatPaceTick(ctx.parsed.y)}/km`}`,
      },
    },
  },
  scales: {
    ...chartOptions.value.scales,
    y: {
      ...chartOptions.value.scales.y,
      reverse: true,
      ticks: {
        ...chartOptions.value.scales.y.ticks,
        callback: (value: string | number) => formatPaceTick(Number(value)),
      },
    },
  },
}))

function withThemedColor(data: LineChartData): LineChartData {
  if (!isDarkTheme.value) return data
  return {
    ...data,
    datasets: [{ ...data.datasets[0], borderColor: '#c8ff4d', backgroundColor: '#c8ff4d' }],
  }
}

const volumeChartDataThemed = computed(() => withThemedColor(volumeChartData.value))
const estimated1RmChartDataThemed = computed(() => withThemedColor(estimated1RmChartData.value))
const maxWeightChartDataThemed = computed(() => withThemedColor(maxWeightChartData.value))
const historyVolumeChartDataThemed = computed(() => withThemedColor(historyVolumeChartData.value))
const distanceChartDataThemed = computed(() => withThemedColor(distanceChartData.value))
const speedChartDataThemed = computed(() => withThemedColor(speedChartData.value))
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-surface px-4 py-6 pb-24">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <h1 class="text-base font-semibold text-gray-900 dark:text-ink">統計</h1>

      <div class="flex overflow-hidden rounded-lg border border-brand-600 dark:border-accent">
        <button
          v-for="r in RANGES"
          :key="r.value"
          type="button"
          class="flex-1 py-1.5 text-sm font-semibold"
          :class="
            range === r.value
              ? 'bg-brand-600 text-white dark:bg-accent dark:text-surface'
              : 'bg-white dark:bg-panel text-brand-600 dark:text-accent hover:bg-brand-50 dark:hover:bg-accent/10'
          "
          @click="range = r.value"
        >
          {{ r.label }}
        </button>
      </div>

      <div class="rounded-lg bg-white dark:bg-panel p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900 dark:text-ink">合計負荷重量の推移</p>
        <LoadingText v-if="volumePending" center />
        <p v-else-if="volumeError" class="text-center text-sm text-red-600 dark:text-red-400">
          データの取得に失敗しました。時間をおいて再度お試しください
        </p>
        <p
          v-else-if="volumeChartData.labels.length === 0"
          class="py-6 text-center text-sm text-gray-500 dark:text-muted"
        >
          この期間の記録がありません
        </p>
        <ClientOnly v-else>
          <div class="h-56">
            <Line :data="volumeChartDataThemed" :options="chartOptions" />
          </div>
        </ClientOnly>
      </div>

      <div class="rounded-lg bg-white dark:bg-panel p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900 dark:text-ink">種目別推移</p>
        <select
          v-model="selectedExerciseId"
          class="mb-3 w-full rounded border border-gray-300 dark:border-border-dark bg-white px-2 py-1.5 text-sm text-gray-900 dark:bg-panel dark:text-ink"
        >
          <option v-if="officialExercises.length === 0" value="">種目がありません</option>
          <optgroup v-if="cardioExercises.length > 0" label="筋トレ">
            <option v-for="e in strengthExercises" :key="e.id" :value="e.id">{{ e.name }}</option>
          </optgroup>
          <optgroup v-if="cardioExercises.length > 0" label="有酸素">
            <option v-for="e in cardioExercises" :key="e.id" :value="e.id">{{ e.name }}</option>
          </optgroup>
          <template v-else>
            <option v-for="e in strengthExercises" :key="e.id" :value="e.id">{{ e.name }}</option>
          </template>
        </select>

        <LoadingText v-if="historyPending" center />
        <p v-else-if="historyError" class="text-center text-sm text-red-600 dark:text-red-400">
          データの取得に失敗しました。時間をおいて再度お試しください
        </p>
        <template v-else-if="selectedExerciseId && isCardioSelected">
          <p
            v-if="distanceChartData.labels.length === 0"
            class="py-6 text-center text-sm text-gray-500 dark:text-muted"
          >
            この期間の記録がありません
          </p>
          <ClientOnly v-else>
            <div class="mb-4">
              <p class="mb-1 text-xs font-semibold text-gray-500 dark:text-muted">距離</p>
              <div class="h-48">
                <Line :data="distanceChartDataThemed" :options="chartOptions" />
              </div>
            </div>
            <div>
              <p class="mb-1 text-xs font-semibold text-gray-500 dark:text-muted">
                {{ isKmhSelected ? '時速' : 'ペース（上ほど速い）' }}
              </p>
              <div class="h-48">
                <Line
                  :data="speedChartDataThemed"
                  :options="isKmhSelected ? chartOptions : paceChartOptions"
                />
              </div>
            </div>
          </ClientOnly>
        </template>
        <template v-else-if="selectedExerciseId">
          <p
            v-if="maxWeightChartData.labels.length === 0"
            class="py-6 text-center text-sm text-gray-500 dark:text-muted"
          >
            この期間の記録がありません
          </p>
          <ClientOnly v-else>
            <div class="mb-4">
              <p class="mb-1 text-xs font-semibold text-gray-500 dark:text-muted">合計負荷重量</p>
              <div class="h-48">
                <Line :data="historyVolumeChartDataThemed" :options="chartOptions" />
              </div>
            </div>
            <div class="mb-4">
              <p class="mb-1 text-xs font-semibold text-gray-500 dark:text-muted">推定1RM</p>
              <p class="mb-1 text-xs text-gray-500 dark:text-muted">
                重さと回数から推定した、1回挙げられる重さの目安（12回までのセットで計算）
              </p>
              <p
                v-if="estimated1RmChartData.labels.length === 0"
                class="py-6 text-center text-sm text-gray-500 dark:text-muted"
              >
                この期間は推定できる記録がありません
              </p>
              <div v-else class="h-48">
                <Line :data="estimated1RmChartDataThemed" :options="chartOptions" />
              </div>
            </div>
            <div>
              <p class="mb-1 text-xs font-semibold text-gray-500 dark:text-muted">最大重量</p>
              <div class="h-48">
                <Line :data="maxWeightChartDataThemed" :options="chartOptions" />
              </div>
            </div>
          </ClientOnly>
        </template>
      </div>
    </div>
  </div>
</template>
