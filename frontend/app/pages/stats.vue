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
import type { StatsRange } from '~/composables/useStats'

definePageMeta({ middleware: 'auth' })

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

// 集計対象は公式種目のみ（backend/src/routes/stats.ts参照）。カスタム種目・削除済みは選択肢に出さない
const officialExercises = computed(
  () => exercises.value?.filter((e) => e.createdBy === null && !e.deletedAt) ?? [],
)

const range = ref<StatsRange>('3m')
const selectedExerciseId = ref<string>('')
watchEffect(() => {
  if (!selectedExerciseId.value && officialExercises.value.length > 0) {
    selectedExerciseId.value = officialExercises.value[0]!.id
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
const maxWeightChartData = ref(toLineChartData([], '最大重量(kg)'))
const historyVolumeChartData = ref(toLineChartData([], '合計負荷重量(kg)'))

async function loadHistory() {
  if (!selectedExerciseId.value) return
  historyPending.value = true
  historyError.value = false
  try {
    const points = await fetchExerciseHistory(selectedExerciseId.value, range.value)
    maxWeightChartData.value = toLineChartData(
      points.map((p) => ({ date: p.date, value: p.maxWeightKg })),
      '最大重量(kg)',
    )
    historyVolumeChartData.value = toLineChartData(
      points.map((p) => ({ date: p.date, value: p.volumeKg })),
      '合計負荷重量(kg)',
    )
  } catch {
    historyError.value = true
  } finally {
    historyPending.value = false
  }
}

watch(range, () => {
  loadVolume()
  loadHistory()
})
watch(selectedExerciseId, loadHistory)
await loadVolume()

const chartOptions = { responsive: true, maintainAspectRatio: false }
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <NuxtLink to="/" class="text-sm text-gray-500">← ホームに戻る</NuxtLink>
        <h1 class="text-base font-semibold text-gray-900">統計</h1>
      </div>

      <div class="flex overflow-hidden rounded-lg border border-brand-600">
        <button
          v-for="r in RANGES"
          :key="r.value"
          type="button"
          class="flex-1 py-1.5 text-sm font-semibold"
          :class="
            range === r.value
              ? 'bg-brand-600 text-white'
              : 'bg-white text-brand-600 hover:bg-brand-50'
          "
          @click="range = r.value"
        >
          {{ r.label }}
        </button>
      </div>

      <div class="rounded-lg bg-white p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900">合計負荷重量の推移</p>
        <p v-if="volumePending" class="text-center text-sm text-gray-500">読み込み中...</p>
        <p v-else-if="volumeError" class="text-center text-sm text-red-600">
          データの取得に失敗しました。時間をおいて再度お試しください
        </p>
        <p
          v-else-if="volumeChartData.labels.length === 0"
          class="py-6 text-center text-sm text-gray-500"
        >
          この期間の記録がありません
        </p>
        <ClientOnly v-else>
          <div class="h-56">
            <Line :data="volumeChartData" :options="chartOptions" />
          </div>
        </ClientOnly>
      </div>

      <div class="rounded-lg bg-white p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900">種目別推移</p>
        <select
          v-model="selectedExerciseId"
          class="mb-3 w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
        >
          <option v-if="officialExercises.length === 0" value="">種目がありません</option>
          <option v-for="e in officialExercises" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>

        <p v-if="historyPending" class="text-center text-sm text-gray-500">読み込み中...</p>
        <p v-else-if="historyError" class="text-center text-sm text-red-600">
          データの取得に失敗しました。時間をおいて再度お試しください
        </p>
        <template v-else-if="selectedExerciseId">
          <p
            v-if="maxWeightChartData.labels.length === 0"
            class="py-6 text-center text-sm text-gray-500"
          >
            この期間の記録がありません
          </p>
          <ClientOnly v-else>
            <div class="mb-4">
              <p class="mb-1 text-xs font-semibold text-gray-500">最大重量</p>
              <div class="h-48">
                <Line :data="maxWeightChartData" :options="chartOptions" />
              </div>
            </div>
            <div>
              <p class="mb-1 text-xs font-semibold text-gray-500">合計負荷重量</p>
              <div class="h-48">
                <Line :data="historyVolumeChartData" :options="chartOptions" />
              </div>
            </div>
          </ClientOnly>
        </template>
      </div>
    </div>
  </div>
</template>
