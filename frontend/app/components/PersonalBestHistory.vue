<script setup lang="ts">
// 統計画面の自己ベスト履歴（Issue #370）。種目別推移カードの末尾に、選択中の種目の自己ベスト更新を
// 新しい順のタイムラインで出す。取得は親（pages/stats.vue）が行い、ここは表示だけを受け持つ。
// モックは`docs/mock/growth-record.html`
import {
  formatBestDate,
  formatBestGain,
  formatBestSet,
  formatBestWeight,
  splitVisibleBests,
  type PersonalBestRecord,
} from '~/utils/personalBests'

const props = defineProps<{
  // 新しい順。先頭が現在のベスト
  records: PersonalBestRecord[]
}>()

// 種目を切り替えたら閉じ直す（親が種目ごとにkeyを変える）
const expanded = ref(false)
const split = computed(() => splitVisibleBests(props.records, expanded.value))
const currentYear = new Date().getFullYear()
</script>

<template>
  <div v-if="records.length > 0" class="mt-4 border-t border-gray-200 dark:border-border-dark pt-3">
    <p class="mb-2 text-xs font-semibold text-gray-500 dark:text-muted">自己ベストの履歴</p>
    <ul
      class="relative pl-[18px] before:absolute before:bottom-1.5 before:left-[5px] before:top-1.5 before:w-0.5 before:bg-gray-200 dark:before:bg-border-dark before:content-['']"
    >
      <li
        v-for="(r, i) in split.visible"
        :key="r.date"
        class="relative pb-3 last:pb-0 before:absolute before:-left-[17px] before:top-1.5 before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:content-['']"
        :class="
          i === 0
            ? 'before:border-brand-600 before:bg-brand-600 dark:before:border-accent dark:before:bg-accent'
            : 'before:border-gray-400 before:bg-white dark:before:border-muted dark:before:bg-panel'
        "
      >
        <p class="text-[11px] text-gray-400 dark:text-muted">
          {{ formatBestDate(r.date, currentYear) }}
        </p>
        <p class="font-bold tabular-nums text-gray-900 dark:text-ink">
          {{ formatBestWeight(r.weightKg)
          }}<span class="ml-0.5 text-xs font-normal text-gray-500 dark:text-muted">kg</span>
          <span
            v-if="formatBestGain(r)"
            class="ml-1.5 text-xs font-semibold text-green-700 dark:text-green-400"
            >{{ formatBestGain(r) }}</span
          >
        </p>
        <p class="text-xs text-gray-500 dark:text-muted">
          {{ formatBestSet(r) }}
          <span v-if="r.previousBestKg === null" class="ml-1">初めての記録</span>
          <span
            v-if="i === 0"
            class="ml-1 whitespace-nowrap rounded-full border border-brand-600/30 bg-brand-50 px-2 py-px text-[11px] text-brand-600 dark:border-accent/30 dark:bg-accent/10 dark:text-accent"
            >現在のベスト</span
          >
        </p>
      </li>
    </ul>
    <button
      v-if="split.hiddenCount > 0 || expanded"
      type="button"
      class="mt-2 w-full text-center text-xs font-semibold text-brand-600 dark:text-accent"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? '閉じる ▴' : `もっと見る（あと${split.hiddenCount}件） ▾` }}
    </button>
    <p class="mt-2 text-[11px] text-gray-400 dark:text-muted">
      最大重量がそれまでの記録を上回った日だけを並べています。<br />
      期間の切り替えに関係なく、全期間が対象です。
    </p>
  </div>
</template>
