<script setup lang="ts">
// Phase4: グループ内ランキング。合計挙上重量（自重セットは0kg扱い、公式種目のみ集計）を
// 週間/月間/通算の3タブで切り替える（docs/schema.md「Phase4の検討結果」参照）。
// Issue #258で種目別ランキング（種目セレクタ）と参加・継続の可視化（attendanceStamp）を追加
import type { AttendanceStamp, GroupRankingExercise, RankingPeriod } from '~/composables/useGroups'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const groupId = route.params.id as string

const PERIODS: { value: RankingPeriod; label: string }[] = [
  { value: 'week', label: '週間' },
  { value: 'month', label: '月間' },
  { value: 'all', label: '通算' },
]

const { fetchGroupRanking, fetchGroupRankingDefaultExercise, fetchGroupRankingExercises } =
  useGroups()
const { user } = useAuth()

// 指標: 合計挙上重量 or 種目別 or 継続（非順位）。種目別に切り替えたときだけ種目一覧・
// デフォルト種目を取得する。継続はGET /groups/:id/rankingが常に返すdaysTrained/attendanceStamp
// を使い回すだけなので、追加のAPI呼び出しは不要（合計挙上重量の取得時に既に含まれている）
type Metric = 'total' | 'exercise' | 'attendance'
const metric = ref<Metric>('total')
const selectedExerciseId = ref<string | null>(null)
// 種目セレクタの候補(グループの誰かが記録したことのある公式種目のみ、使用回数の多い順)。
// 公式種目77種目全件だと選びづらいという指摘を受けて絞り込んだ(2026-09-25決定、docs/spec.md参照)
const rankingExercises = ref<GroupRankingExercise[] | null>(null)

const period = ref<RankingPeriod>('week')
const ranking = ref<Awaited<ReturnType<typeof fetchGroupRanking>>['ranking'] | null>(null)
const pending = ref(true)
const loadError = ref(false)

async function load() {
  // 種目別モードで選べる種目が1つも無い場合は、誤って合計扱いで取得しない(exerciseId未指定だと
  // バックエンドは合計挙上重量ランキングを返すため、選択中の種目名と表示がズレてしまう)
  if (metric.value === 'exercise' && !selectedExerciseId.value) {
    ranking.value = []
    pending.value = false
    return
  }
  pending.value = true
  loadError.value = false
  try {
    const exerciseId = metric.value === 'exercise' ? selectedExerciseId.value : null
    const result = await fetchGroupRanking(groupId, period.value, exerciseId)
    ranking.value = result.ranking
  } catch {
    loadError.value = true
  } finally {
    pending.value = false
  }
}
await load()
watch(period, load)

// 種目別に初めて切り替えたときだけ、種目一覧とグループ内の直近人気種目を取得する
let exerciseModeLoaded = false
async function onSelectMetric(next: Metric) {
  if (metric.value === next) return
  metric.value = next
  if (next === 'attendance') return // 既存のranking.valueをそのまま並べ替えて使うため再取得不要
  if (next === 'exercise' && !exerciseModeLoaded) {
    exerciseModeLoaded = true
    pending.value = true
    try {
      const [exercisesResult, defaultExercise] = await Promise.all([
        fetchGroupRankingExercises(groupId),
        fetchGroupRankingDefaultExercise(groupId),
      ])
      rankingExercises.value = exercisesResult
      // グループ内に直近の使用実績が無ければ(defaultExercise.exerciseId === null)、
      // 一覧の先頭(使用回数の多い順、fetchGroupRankingExercisesの既存ソート)にフォールバックする
      selectedExerciseId.value = defaultExercise.exerciseId ?? exercisesResult[0]?.id ?? null
    } catch {
      loadError.value = true
      pending.value = false
      return
    }
  }
  await load()
}

async function onSelectExercise(exerciseId: string) {
  selectedExerciseId.value = exerciseId
  await load()
}

// 上位3人は表彰台形式で強調表示する。表示上は中央に1位を置くため並び替える
// 同着（同順位）のメンバーがいる場合はrankの値が重複するため、rankではなくAPIが返す
// 順序（ranking配列のindex）で並び替える(同着2人が両方rank=2になるケースで、rankをMapの
// キーにすると片方が上書きされ消えてしまう不具合があった)
const top3 = computed(() => (ranking.value ?? []).filter((r) => r.rank <= 3).slice(0, 3))
const podiumOrder = computed(() => {
  const [first, second, third] = top3.value
  return [second, first, third]
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

// 継続タブ用。順位を連想させないよう、rankではなく名前順（あいうえお順）で並べる
const attendanceSorted = computed(() =>
  [...(ranking.value ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja')),
)

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

// 参加・継続の可視化用スタンプ（継続タブ専用）。当初は合計/種目別の一覧に順位バッジと並べて
// 表示していたが、金・銀・銅の配色・文言が隣の順位バッジ（同じ金銀銅配色）と混同され
// 「もう一つの順位」に見えるという指摘を受け、順位が存在しない別タブに切り出した（2026-09-24）。
// タブ自体を分けたことに加え、見た目もブランドのオレンジ1色の濃淡4段階
// （bg-brand-100→400→700、ダークはアクセント色の濃淡）にし、「順位」を連想させる言葉
// （金・銀・銅）も使わない
const ATTENDANCE_STAMP_LABELS: Record<AttendanceStamp, string> = {
  none: '記録なし',
  bronze: 'たまに',
  silver: 'コンスタント',
  gold: 'ハイペース',
}
const ATTENDANCE_STAMP_CLASSES: Record<AttendanceStamp, string> = {
  none: 'bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-muted',
  bronze: 'bg-brand-100 text-brand-700 dark:bg-accent/10 dark:text-accent',
  silver: 'bg-brand-400 text-brand-900 dark:bg-accent/25 dark:text-accent',
  gold: 'bg-brand-700 text-white dark:bg-accent/45 dark:text-surface',
}
// 「ハイペース・18日」のように日数を併記する（記録なしのときは0日を添えても意味が無いので省く）。
// バッジの幅(w-28)は「コンスタント・17日」（直近28日の窓で出うる最長の文言、日数は常に2桁以下）の
// 実測幅(約94px、10px boldフォントでcanvas.measureTextにより確認)に余裕を持たせた固定値。
// 文言ごとに幅が変わらないよう、パディングではなく固定幅+中央寄せ(justify-center)で揃えている
function attendanceLabel(entry: { attendanceStamp: AttendanceStamp; daysTrained: number }): string {
  const label = ATTENDANCE_STAMP_LABELS[entry.attendanceStamp]
  return entry.attendanceStamp === 'none' ? label : `${label}・${entry.daysTrained}日`
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-surface">
    <PageHeader :back-to="`/groups/${groupId}`" back-label="グループに戻る" title="ランキング" />
    <div class="px-4 pb-6">
      <div class="mx-auto flex max-w-sm flex-col gap-4">
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-lg border border-brand-600 dark:border-accent py-1.5 text-sm font-semibold"
            :class="
              metric === 'total'
                ? 'bg-brand-600 text-white dark:bg-accent dark:text-surface'
                : 'bg-white dark:bg-panel text-brand-600 dark:text-accent hover:bg-brand-50 dark:hover:bg-accent/10'
            "
            @click="onSelectMetric('total')"
          >
            合計
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg border border-brand-600 dark:border-accent py-1.5 text-sm font-semibold"
            :class="
              metric === 'exercise'
                ? 'bg-brand-600 text-white dark:bg-accent dark:text-surface'
                : 'bg-white dark:bg-panel text-brand-600 dark:text-accent hover:bg-brand-50 dark:hover:bg-accent/10'
            "
            @click="onSelectMetric('exercise')"
          >
            種目別
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg border border-brand-600 dark:border-accent py-1.5 text-sm font-semibold"
            :class="
              metric === 'attendance'
                ? 'bg-brand-600 text-white dark:bg-accent dark:text-surface'
                : 'bg-white dark:bg-panel text-brand-600 dark:text-accent hover:bg-brand-50 dark:hover:bg-accent/10'
            "
            @click="onSelectMetric('attendance')"
          >
            継続
          </button>
        </div>

        <select
          v-if="metric === 'exercise'"
          :value="selectedExerciseId ?? ''"
          class="w-full rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-panel px-3 py-2 text-sm text-gray-900 dark:text-ink"
          @change="onSelectExercise(($event.target as HTMLSelectElement).value)"
        >
          <option v-if="(rankingExercises ?? []).length === 0" value="" disabled>
            種目がありません
          </option>
          <option v-for="e in rankingExercises ?? []" :key="e.id" :value="e.id">
            {{ e.name }}
          </option>
        </select>

        <div
          v-if="metric !== 'attendance'"
          class="flex overflow-hidden rounded-lg border border-brand-600 dark:border-accent"
        >
          <button
            v-for="p in PERIODS"
            :key="p.value"
            type="button"
            class="flex-1 py-1.5 text-sm font-semibold"
            :class="
              period === p.value
                ? 'bg-brand-600 text-white dark:bg-accent dark:text-surface'
                : 'bg-white dark:bg-panel text-brand-600 dark:text-accent hover:bg-brand-50 dark:hover:bg-accent/10'
            "
            @click="period = p.value"
          >
            {{ p.label }}
          </button>
        </div>

        <LoadingText v-if="pending" center />
        <p v-else-if="loadError" class="text-center text-sm text-red-600 dark:text-red-400">
          ランキングの取得に失敗しました。時間をおいて再度お試しください
        </p>
        <p
          v-else-if="!ranking || ranking.length === 0"
          class="text-center text-sm text-gray-500 dark:text-muted"
        >
          メンバーがいません
        </p>

        <template v-else>
          <!-- 継続タブ：順位を持たない別軸の一覧。名前順（あいうえお順）に並べ、
           各メンバーの直近28日の参加・継続スタンプだけを見せる -->
          <template v-if="metric === 'attendance'">
            <div class="rounded-lg bg-white dark:bg-panel p-4 shadow">
              <ul class="flex flex-col">
                <li
                  v-for="entry in attendanceSorted"
                  :key="entry.userId"
                  class="flex items-center gap-2.5 border-t border-gray-100 dark:border-white/5 py-2.5 first:border-t-0"
                  :class="
                    entry.userId === user?.id
                      ? '-mx-2 rounded-lg bg-brand-50 dark:bg-accent/10 px-2'
                      : ''
                  "
                >
                  <span class="flex-1 truncate text-sm font-semibold text-gray-900 dark:text-ink">
                    {{ entry.displayName }}
                    <span
                      v-if="entry.userId === user?.id"
                      class="ml-1 rounded-full bg-brand-100 dark:bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:text-accent"
                    >
                      自分
                    </span>
                  </span>
                  <span
                    class="inline-flex h-5 w-28 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                    :class="ATTENDANCE_STAMP_CLASSES[entry.attendanceStamp]"
                  >
                    {{ attendanceLabel(entry) }}
                  </span>
                </li>
              </ul>
            </div>
            <p class="text-center text-xs text-gray-400 dark:text-muted">
              順位ではなく、直近28日にトレーニングした日数の目安です（ハイペース:18日〜
              コンスタント:7日〜 たまに:1日〜）
            </p>
          </template>

          <template v-else>
            <div v-if="top3.length > 0" class="rounded-lg bg-white dark:bg-panel p-4 shadow">
              <div class="grid grid-cols-3 items-end gap-2">
                <div
                  v-for="entry in podiumOrder"
                  :key="entry?.userId ?? entry?.rank"
                  class="flex flex-col items-center gap-1.5"
                >
                  <template v-if="entry">
                    <div
                      class="flex items-center justify-center rounded-full font-bold tabular-nums"
                      :class="[
                        entry.rank === 1 ? 'h-14 w-14 text-base' : 'h-10 w-10 text-sm',
                        medalClasses(entry.rank),
                      ]"
                    >
                      {{ entry.rank }}
                    </div>
                    <p
                      class="max-w-[80px] truncate text-xs font-semibold text-gray-900 dark:text-ink"
                    >
                      {{ entry.displayName }}
                    </p>
                    <p class="text-xs font-bold tabular-nums text-gray-700 dark:text-ink">
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

            <div class="rounded-lg bg-white dark:bg-panel p-4 shadow">
              <ul class="flex flex-col">
                <li
                  v-for="entry in ranking"
                  :key="entry.userId"
                  class="flex items-center gap-2.5 border-t border-gray-100 dark:border-white/5 py-2.5 first:border-t-0"
                  :class="
                    entry.userId === user?.id
                      ? '-mx-2 rounded-lg bg-brand-50 dark:bg-accent/10 px-2'
                      : ''
                  "
                >
                  <span
                    v-if="entry.rank <= 3"
                    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums"
                    :class="medalClasses(entry.rank)"
                  >
                    {{ entry.rank }}
                  </span>
                  <span
                    v-else
                    class="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400 dark:text-muted"
                  >
                    {{ entry.rank }}
                  </span>
                  <span class="flex-1 truncate text-sm font-semibold text-gray-900 dark:text-ink">
                    {{ entry.displayName }}
                    <span
                      v-if="entry.userId === user?.id"
                      class="ml-1 rounded-full bg-brand-100 dark:bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:text-accent"
                    >
                      自分
                    </span>
                  </span>
                  <span class="shrink-0 text-sm font-bold tabular-nums text-gray-700 dark:text-ink">
                    {{ formatVolume(entry.totalVolumeKg)
                    }}<span class="text-xs font-medium text-gray-400 dark:text-muted">kg</span>
                  </span>
                </li>
              </ul>
            </div>
            <p class="text-center text-xs text-gray-400 dark:text-muted">
              <template v-if="metric === 'exercise'">
                {{
                  (rankingExercises ?? []).find((e) => e.id === selectedExerciseId)?.name ??
                  '選択した種目'
                }}の挙上重量でランキングしています
              </template>
              <template v-else>
                合計挙上重量（公式種目のみ、自重種目は0kg扱い）でランキングしています
              </template>
            </p>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>
