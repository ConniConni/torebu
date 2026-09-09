<script setup lang="ts">
// Phase4: グループ内ランキング。合計挙上重量（自重セットは0kg扱い、公式種目のみ集計）を
// 週間/月間/通算の3タブで切り替える（docs/schema.md「Phase4の検討結果」参照）
import type { RankingPeriod } from '~/composables/useGroups'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const groupId = route.params.id as string

const PERIODS: { value: RankingPeriod; label: string }[] = [
  { value: 'week', label: '週間' },
  { value: 'month', label: '月間' },
  { value: 'all', label: '通算' },
]

const { fetchGroupRanking } = useGroups()
const { user } = useAuth()

const period = ref<RankingPeriod>('week')
const ranking = ref<Awaited<ReturnType<typeof fetchGroupRanking>>['ranking'] | null>(null)
const pending = ref(true)
const loadError = ref(false)

async function load() {
  pending.value = true
  loadError.value = false
  try {
    const result = await fetchGroupRanking(groupId, period.value)
    ranking.value = result.ranking
  } catch {
    loadError.value = true
  } finally {
    pending.value = false
  }
}
await load()
watch(period, load)

// 上位3人は表彰台形式で強調表示する。表示上は中央に1位を置くため並び替える
const top3 = computed(() => (ranking.value ?? []).filter((r) => r.rank <= 3))
const podiumOrder = computed(() => {
  const byRank = new Map(top3.value.map((r) => [r.rank, r]))
  return [byRank.get(2), byRank.get(1), byRank.get(3)]
})

// 表彰台の土台（棒グラフ部分）の高さ。1位の実績を基準に相対的な高さで実績差を見せる
// （全員0kgのときは全員同じ最小の高さになる）
const PODIUM_BAR_MIN_PX = 12
const PODIUM_BAR_MAX_PX = 48
const podiumMaxVolume = computed(() => Math.max(1, ...top3.value.map((r) => r.totalVolumeKg)))
function podiumBarHeightPx(volumeKg: number): number {
  const ratio = volumeKg / podiumMaxVolume.value
  return PODIUM_BAR_MIN_PX + ratio * (PODIUM_BAR_MAX_PX - PODIUM_BAR_MIN_PX)
}

function formatVolume(volumeKg: number): string {
  return volumeKg.toLocaleString('ja-JP')
}

// 1〜3位の金・銀・銅配色。ブランドのオレンジとは別軸の配色にする（事前にモックで承認済み）。
// bg/textはいずれもWCAG AAのコントラスト比4.5:1以上になる組み合わせを検証して選んでいる
// （銅は当初bgが暗めで文字を濃くしても読みにくかったため、bg側を明るいテラコッタ寄りに変更した）
const MEDAL_COLORS: Record<1 | 2 | 3, { bg: string; text: string; bar: string }> = {
  1: { bg: 'bg-[#eab90d]', text: 'text-[#5c3d00]', bar: 'bg-[#fbedb8]' },
  2: { bg: 'bg-[#b9c1cc]', text: 'text-[#374151]', bar: 'bg-[#e9edf1]' },
  3: { bg: 'bg-[#e2a06a]', text: 'text-[#341a08]', bar: 'bg-[#f2dcc6]' },
}
function medalClasses(rank: number): string {
  const c = MEDAL_COLORS[rank as 1 | 2 | 3]
  return c ? `${c.bg} ${c.text}` : ''
}
function medalBarClass(rank: number): string {
  return MEDAL_COLORS[rank as 1 | 2 | 3]?.bar ?? ''
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <NuxtLink :to="`/groups/${groupId}`" class="text-sm text-gray-500">← グループに戻る</NuxtLink>
        <h1 class="text-base font-semibold text-gray-900">ランキング</h1>
      </div>

      <div class="flex overflow-hidden rounded-lg border border-brand-600">
        <button
          v-for="p in PERIODS"
          :key="p.value"
          type="button"
          class="flex-1 py-1.5 text-sm font-semibold"
          :class="
            period === p.value ? 'bg-brand-600 text-white' : 'bg-white text-brand-600 hover:bg-brand-50'
          "
          @click="period = p.value"
        >
          {{ p.label }}
        </button>
      </div>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="loadError" class="text-center text-sm text-red-600">
        ランキングの取得に失敗しました。時間をおいて再度お試しください
      </p>
      <p v-else-if="!ranking || ranking.length === 0" class="text-center text-sm text-gray-500">
        メンバーがいません
      </p>

      <template v-else>
        <div v-if="top3.length > 0" class="rounded-lg bg-white p-4 shadow">
          <div class="grid grid-cols-3 items-end gap-2">
            <div
              v-for="entry in podiumOrder"
              :key="entry?.userId ?? entry?.rank"
              class="flex flex-col items-center gap-1.5"
            >
              <template v-if="entry">
                <div
                  class="flex items-center justify-center rounded-full font-bold tabular-nums"
                  :class="[entry.rank === 1 ? 'h-14 w-14 text-base' : 'h-10 w-10 text-sm', medalClasses(entry.rank)]"
                >
                  {{ entry.rank }}
                </div>
                <p class="max-w-[80px] truncate text-xs font-semibold text-gray-900">
                  {{ entry.displayName }}
                </p>
                <p class="text-xs font-bold tabular-nums text-gray-700">
                  {{ formatVolume(entry.totalVolumeKg) }}kg
                </p>
                <!-- 実績（合計挙上重量）を1位比の相対的な高さで示す棒。実際の値でこそ意味があるため
                     ランクの見た目上の並び(2-1-3)ではなく実測値から高さを都度計算する -->
                <div
                  class="w-full rounded-t"
                  :style="{ height: `${podiumBarHeightPx(entry.totalVolumeKg)}px` }"
                  :class="medalBarClass(entry.rank)"
                />
              </template>
            </div>
          </div>
        </div>

        <div class="rounded-lg bg-white p-4 shadow">
          <ul class="flex flex-col">
            <li
              v-for="entry in ranking"
              :key="entry.userId"
              class="flex items-center gap-2.5 border-t border-gray-100 py-2.5 first:border-t-0"
              :class="entry.userId === user?.id ? '-mx-2 rounded-lg bg-brand-50 px-2' : ''"
            >
              <span
                v-if="entry.rank <= 3"
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums"
                :class="medalClasses(entry.rank)"
              >
                {{ entry.rank }}
              </span>
              <span v-else class="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">
                {{ entry.rank }}
              </span>
              <span class="flex-1 truncate text-sm font-semibold text-gray-900">
                {{ entry.displayName }}
                <span
                  v-if="entry.userId === user?.id"
                  class="ml-1 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700"
                >
                  自分
                </span>
              </span>
              <span class="shrink-0 text-sm font-bold tabular-nums text-gray-700">
                {{ formatVolume(entry.totalVolumeKg) }}<span class="text-xs font-medium text-gray-400">kg</span>
              </span>
            </li>
          </ul>
        </div>
        <p class="text-center text-xs text-gray-400">
          合計挙上重量（公式種目のみ、自重種目は0kg扱い）でランキングしています
        </p>
      </template>
    </div>
  </div>
</template>
