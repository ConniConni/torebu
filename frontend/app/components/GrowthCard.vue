<script setup lang="ts">
// 統計画面の期間比較カード（Issue #366）。選んだ期間を直前の同じ長さの期間と比べる。
// 取得は親（pages/stats.vue）が行い、ここは表示だけを受け持つ。モックは`docs/mock/growth-record.html`
import type { GrowthResponse } from '~/composables/useStats'
import {
  barPercent,
  formatOneRmKg,
  formatPeriod,
  formatSignedDays,
  formatSignedPct,
  formatVolumeKg,
  growthDirection,
  splitVisibleExercises,
  type GrowthDirection,
} from '~/utils/growth'

const props = defineProps<{
  growth: GrowthResponse | null
  pending: boolean
  error: boolean
  // 見出し用（「1ヶ月」「3ヶ月」）
  rangeLabel: string
}>()

// 折りたたみの開閉。期間を切り替えたら閉じ直す
const expanded = ref(false)
watch(
  () => props.growth?.range,
  () => {
    expanded.value = false
  },
)

const exerciseList = computed(() => (props.growth?.hasPrevious ? props.growth.exercises : []))
const split = computed(() => splitVisibleExercises(exerciseList.value, expanded.value))

function directionClass(direction: GrowthDirection | null) {
  if (direction === 'up') return 'text-green-700 dark:text-green-400'
  if (direction === 'down') return 'text-amber-700 dark:text-amber-400'
  return 'text-gray-400 dark:text-muted'
}
function arrow(direction: GrowthDirection | null) {
  if (direction === 'up') return '▲ '
  if (direction === 'down') return '▼ '
  return ''
}
</script>

<template>
  <div class="rounded-lg bg-white dark:bg-panel p-4 shadow">
    <p class="text-sm font-semibold text-gray-900 dark:text-ink">この{{ rangeLabel }}の伸び</p>
    <LoadingText v-if="pending && !growth" center />
    <p v-else-if="error" class="mt-2 text-center text-sm text-red-600 dark:text-red-400">
      データの取得に失敗しました。<br />
      時間をおいて、もう一度お試しください。
    </p>
    <template v-else-if="growth">
      <p class="mb-3 text-xs text-gray-400 dark:text-muted">
        <template v-if="growth.hasPrevious">
          {{ formatPeriod(growth.currentStart, growth.currentEnd) }} と
          {{ formatPeriod(growth.previousStart, growth.previousEnd) }} の比較
        </template>
        <template v-else>{{ formatPeriod(growth.currentStart, growth.currentEnd) }}</template>
      </p>

      <p
        v-if="!growth.hasPrevious"
        class="rounded-lg border border-dashed border-gray-300 dark:border-border-dark px-3 py-4 text-center text-sm text-gray-500 dark:text-muted"
      >
        比較できる前の期間（{{ formatPeriod(growth.previousStart, growth.previousEnd) }}）の<br />
        記録がまだありません。<br />
        記録を続けると、ここに伸びが出ます。
      </p>

      <template v-else>
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg border border-gray-200 dark:border-border-dark px-3 py-2">
            <p class="text-xs text-gray-500 dark:text-muted">合計負荷重量</p>
            <p class="text-lg font-bold tabular-nums text-gray-900 dark:text-ink">
              {{ formatVolumeKg(growth.current.volumeKg)
              }}<span class="ml-0.5 text-xs font-normal text-gray-500 dark:text-muted">kg</span>
            </p>
            <p
              class="text-xs font-semibold tabular-nums"
              :class="directionClass(growthDirection(growth.volumeChangePct))"
            >
              {{ arrow(growthDirection(growth.volumeChangePct))
              }}{{ formatSignedPct(growth.volumeChangePct) }}
            </p>
            <p class="text-[11px] text-gray-400 dark:text-muted">
              前の期間 {{ formatVolumeKg(growth.previous.volumeKg) }}kg
            </p>
          </div>
          <div class="rounded-lg border border-gray-200 dark:border-border-dark px-3 py-2">
            <p class="text-xs text-gray-500 dark:text-muted">トレ日数</p>
            <p class="text-lg font-bold tabular-nums text-gray-900 dark:text-ink">
              {{ growth.current.trainingDays
              }}<span class="ml-0.5 text-xs font-normal text-gray-500 dark:text-muted">日</span>
            </p>
            <p
              class="text-xs font-semibold tabular-nums"
              :class="directionClass(growthDirection(growth.trainingDaysDiff))"
            >
              {{ arrow(growthDirection(growth.trainingDaysDiff))
              }}{{ formatSignedDays(growth.trainingDaysDiff) }}
            </p>
            <p class="text-[11px] text-gray-400 dark:text-muted">
              前の期間 {{ growth.previous.trainingDays }}日
            </p>
          </div>
        </div>

        <template v-if="exerciseList.length > 0">
          <p class="mt-3 mb-1 text-xs font-semibold text-gray-500 dark:text-muted">
            種目別 推定1RMの伸び
          </p>
          <ul>
            <li
              v-for="(e, i) in split.visible"
              :key="e.exerciseId"
              class="py-2"
              :class="i > 0 ? 'border-t border-gray-200 dark:border-border-dark' : ''"
            >
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-sm font-semibold text-gray-900 dark:text-ink">{{ e.name }}</span>
                <span class="shrink-0 text-xs tabular-nums text-gray-400 dark:text-muted">
                  {{ formatOneRmKg(e.previousKg) }}→{{ formatOneRmKg(e.currentKg) }}kg
                  <span
                    class="ml-1 font-semibold"
                    :class="directionClass(growthDirection(e.growthPct))"
                    >{{ formatSignedPct(e.growthPct) }}</span
                  >
                </span>
              </div>
              <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-surface">
                <div
                  v-if="barPercent(e.growthPct, exerciseList) !== null"
                  class="h-full rounded-full bg-brand-600 dark:bg-accent"
                  :style="{ width: `${barPercent(e.growthPct, exerciseList)}%` }"
                />
              </div>
            </li>
          </ul>
          <button
            v-if="split.hiddenCount > 0 || expanded"
            type="button"
            class="mt-1 w-full border-t border-gray-200 dark:border-border-dark pt-2 text-center text-xs font-semibold text-brand-600 dark:text-accent"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
          >
            {{ expanded ? '閉じる ▴' : `ほか${split.hiddenCount}種目を見る ▾` }}
          </button>
          <p class="mt-2 text-[11px] text-gray-400 dark:text-muted">
            棒の長さは伸び率です（この期間で一番伸びた種目が100%）。<br />
            推定1RMは期間内の最大値で比べています。<br />
            両方の期間に記録がある種目だけ表示します。
          </p>
        </template>
      </template>
    </template>
  </div>
</template>
