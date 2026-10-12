<script setup lang="ts">
// 有酸素（Issue #345）の記録を読み取り専用で表示する表。②ホームの記録カードとグループの記録フィードで
// 共通に使う。筋トレの表（セット・重量・回数）と同じ見た目で、列は 記録No.・距離・時間・速さ。
// 速さ（ペース／時速）は距離・時間がそろった行だけ表示し、単位は種目のspeedUnitで決まる
import type { SpeedUnit } from '~/utils/cardio'

defineProps<{
  sets: { id: string; setOrder: number; distanceKm: number | null; durationSec: number | null }[]
  speedUnit: SpeedUnit | null
}>()
</script>

<template>
  <div class="overflow-x-auto">
    <div class="min-w-[15rem] overflow-hidden rounded-lg">
      <div
        class="grid grid-cols-[2.25rem_minmax(3.5rem,1fr)_minmax(3.5rem,1fr)_minmax(4.5rem,1.2fr)] gap-x-2.5 bg-gray-100 dark:bg-white/5 px-3 py-1"
      >
        <span class="text-xs font-semibold text-gray-500 dark:text-muted">No.</span>
        <span class="text-xs font-semibold text-gray-500 dark:text-muted">距離</span>
        <span class="text-xs font-semibold text-gray-500 dark:text-muted">時間</span>
        <span class="text-right text-xs font-semibold text-gray-500 dark:text-muted">{{
          speedLabel(speedUnit)
        }}</span>
      </div>
      <div
        v-for="(set, i) in sets"
        :key="set.id"
        class="grid grid-cols-[2.25rem_minmax(3.5rem,1fr)_minmax(3.5rem,1fr)_minmax(4.5rem,1.2fr)] items-center gap-x-2.5 px-3 py-1"
        :class="i % 2 === 1 ? 'bg-gray-50 dark:bg-surface' : ''"
      >
        <span class="text-center text-sm font-bold tabular-nums text-gray-900 dark:text-ink">{{
          set.setOrder
        }}</span>
        <span class="text-sm tabular-nums text-gray-900 dark:text-ink">{{
          set.distanceKm === null ? '-' : formatDistance(set.distanceKm)
        }}</span>
        <span class="text-sm tabular-nums text-gray-900 dark:text-ink">{{
          set.durationSec === null ? '-' : formatDuration(set.durationSec)
        }}</span>
        <span class="text-right text-sm tabular-nums text-gray-900 dark:text-ink">{{
          formatSpeed(set, speedUnit) ?? '-'
        }}</span>
      </div>
    </div>
  </div>
</template>
