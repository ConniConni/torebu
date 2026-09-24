<script setup lang="ts">
// ⑨マイページ（Issue #237）。ユーザー情報の集約・サポート情報への導線をまとめる画面。
// グループPro・ダークモード（アプリの見た目）はStripe連携の実装が別Issueになるため、
// 今回は「準備中」の非活性表示のみ置く
// （押しても何も起きない状態を避けつつ、モックの構成には合わせる。docs/backlog.md
// 「マイページ（⑨）の新設・設計」参照）
definePageMeta({ middleware: 'auth' })

const { user, logout } = useAuth()
const { groups, pending: groupsPending, error: groupsError, fetchGroups } = useGroups()
const { workouts, fetchWorkouts } = useWorkouts()
const { fetchVolume } = useStats()

if (!groups.value) {
  await fetchGroups()
}

// 実績サマリーは直近28日のみ（②ホームの期間別サマリーカードと違い期間タブは持たない、
// docs/backlog.md参照）。合計負荷重量は既存GET /stats/volume（range=all）、トレ日数は
// 既存GET /workoutsのperformedAt一覧をそれぞれフロントで直近28日分に集計する
// （②ホームと同じtrainingVolume.ts・trainingDays.tsを流用。HomeScreen.vue参照）
const today = todayLocalDateString()
const recentVolumeKg = ref(0)
const recentTrainingDays = ref(0)
const summaryPending = ref(true)
const summaryError = ref(false)

async function loadSummary() {
  summaryPending.value = true
  summaryError.value = false
  try {
    const [points] = await Promise.all([fetchVolume('all'), fetchWorkouts()])
    recentVolumeKg.value = sumRecentVolume(points, today, 28)
    recentTrainingDays.value = countRecentTrainingDays(
      (workouts.value ?? []).filter((w) => w.hasSets).map((w) => w.performedAt),
      today,
      28,
    )
  } catch {
    summaryError.value = true
  } finally {
    summaryPending.value = false
  }
}
await loadSummary()

const ROLE_LABEL: Record<'owner' | 'member', string> = { owner: 'オーナー', member: 'メンバー' }

// /loginへの遷移はlogout()内でフルリロードにより行う（Issue #245、useAuth.ts参照）
async function onLogout() {
  await logout()
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-surface px-4 py-6 pb-24">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <NuxtLink to="/" class="text-sm text-gray-500 dark:text-muted">← ホームに戻る</NuxtLink>
        <h1 class="text-base font-semibold text-gray-900 dark:text-ink">マイページ</h1>
      </div>

      <!-- プロフィール表示（表示のみ、編集機能は持たない。docs/backlog.md参照） -->
      <div class="flex items-center gap-3 rounded-lg bg-white dark:bg-panel p-4 shadow">
        <span
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-accent/15 text-lg font-semibold text-brand-700 dark:text-accent"
        >
          {{ (user?.displayName ?? '?').slice(0, 1) }}
        </span>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-gray-900 dark:text-ink">
            {{ user?.displayName }}
          </p>
          <p class="truncate text-xs text-gray-500 dark:text-muted">{{ user?.email }}</p>
        </div>
      </div>

      <!-- 実績サマリー（直近28日、既存GET /stats/volume・GET /workoutsを流用） -->
      <div class="rounded-lg bg-white dark:bg-panel p-4 shadow">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-gray-900 dark:text-ink">直近28日の実績</p>
          <NuxtLink to="/stats" class="text-sm text-brand-600 dark:text-accent"
            >統計を見る →</NuxtLink
          >
        </div>
        <p v-if="summaryPending" class="text-xs text-gray-400 dark:text-muted">読み込み中...</p>
        <p v-else-if="summaryError" class="text-xs text-red-600 dark:text-red-400">
          サマリーの取得に失敗しました
        </p>
        <div v-else class="grid grid-cols-2 gap-2">
          <div class="rounded bg-brand-50 dark:bg-accent/10 p-2.5">
            <p class="text-xs text-brand-700 dark:text-accent">負荷重量</p>
            <p class="text-xl font-bold tabular-nums text-brand-900 dark:text-accent">
              {{ formatTons(recentVolumeKg) }}
            </p>
          </div>
          <div class="rounded bg-brand-50 dark:bg-accent/10 p-2.5">
            <p class="text-xs text-brand-700 dark:text-accent">トレ日数</p>
            <p class="text-xl font-bold tabular-nums text-brand-900 dark:text-accent">
              {{ recentTrainingDays }}日
            </p>
          </div>
        </div>
      </div>

      <!-- 所属グループ一覧（既存GET /groupsを流用。名前・人数・自分の役割のみ、課金ボタンは
           含めない。docs/backlog.md参照） -->
      <div class="rounded-lg bg-white dark:bg-panel p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900 dark:text-ink">所属グループ</p>
        <p v-if="groupsPending" class="text-xs text-gray-400 dark:text-muted">読み込み中...</p>
        <p v-else-if="groupsError" class="text-xs text-red-600 dark:text-red-400">
          グループの取得に失敗しました
        </p>
        <div v-else-if="!groups || groups.length === 0">
          <p class="mb-2 text-xs text-gray-500 dark:text-muted">所属しているグループはありません</p>
          <NuxtLink
            to="/groups"
            class="block rounded bg-brand-600 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700 dark:bg-accent dark:text-surface dark:hover:bg-accent/90"
          >
            グループを作成・参加する
          </NuxtLink>
        </div>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="group in groups" :key="group.id">
            <NuxtLink
              :to="`/groups/${group.id}`"
              class="flex items-center gap-3 rounded border border-gray-200 dark:border-border-dark px-3 py-2 hover:bg-brand-50 dark:hover:bg-accent/10"
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 dark:bg-accent/10"
              >
                <GroupIcon class="h-4 w-4 text-brand-600 dark:text-accent" />
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm text-gray-900 dark:text-ink">{{ group.name }}</p>
                <p class="text-xs text-gray-500 dark:text-muted">
                  {{ group.memberCount }}人 ・ {{ ROLE_LABEL[group.role] }}
                </p>
              </div>
            </NuxtLink>
          </li>
        </ul>
      </div>

      <!-- アプリの見た目（ダークモード）。グループPro・個人テーマ購入はStripe連携着手の
           Issueで実装するため、それまでは「準備中」の非活性表示にする（docs/backlog.md参照） -->
      <div class="rounded-lg bg-white dark:bg-panel p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900 dark:text-ink">アプリの見た目</p>
        <div
          class="flex items-center gap-3 rounded border border-gray-100 dark:border-white/5 px-3 py-2"
        >
          <MoonIcon class="h-5 w-5 shrink-0 text-gray-300 dark:text-white/20" />
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-400 dark:text-muted">ダークモード</p>
          </div>
          <span
            class="shrink-0 rounded bg-gray-100 dark:bg-white/5 px-2 py-1 text-xs text-gray-500 dark:text-muted"
            >準備中</span
          >
        </div>
      </div>

      <!-- アカウント（パスワード変更、Issue #247） -->
      <div class="rounded-lg bg-white dark:bg-panel p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900 dark:text-ink">アカウント</p>
        <NuxtLink
          to="/mypage/password"
          class="flex items-center gap-3 py-2 text-sm text-gray-700 dark:text-ink hover:text-brand-700 dark:hover:text-accent"
        >
          <LockClosedIcon class="h-5 w-5 shrink-0 text-brand-500 dark:text-accent" />
          <span class="flex-1">パスワードを変更</span>
          <ChevronRightIcon class="h-4 w-4 shrink-0 text-gray-300 dark:text-white/20" />
        </NuxtLink>
      </div>

      <!-- サポート・情報（バージョン表示は持たない。docs/backlog.md参照） -->
      <div class="rounded-lg bg-white dark:bg-panel p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900 dark:text-ink">サポート・情報</p>
        <ul
          class="flex flex-col divide-y divide-gray-100 dark:divide-white/5 text-sm text-gray-700 dark:text-ink"
        >
          <li>
            <NuxtLink
              to="/terms"
              class="flex items-center gap-3 py-2 hover:text-brand-700 dark:hover:text-accent"
            >
              <InfoIcon class="h-5 w-5 shrink-0 text-brand-500 dark:text-accent" />
              <span class="flex-1">利用規約</span>
              <ChevronRightIcon class="h-4 w-4 shrink-0 text-gray-300 dark:text-white/20" />
            </NuxtLink>
          </li>
          <li>
            <NuxtLink
              to="/privacy"
              class="flex items-center gap-3 py-2 hover:text-brand-700 dark:hover:text-accent"
            >
              <InfoIcon class="h-5 w-5 shrink-0 text-brand-500 dark:text-accent" />
              <span class="flex-1">プライバシーポリシー</span>
              <ChevronRightIcon class="h-4 w-4 shrink-0 text-gray-300 dark:text-white/20" />
            </NuxtLink>
          </li>
          <li>
            <a
              href="mailto:torebu1442@gmail.com"
              class="flex items-center gap-3 py-2 hover:text-brand-700 dark:hover:text-accent"
            >
              <EnvelopeIcon class="h-5 w-5 shrink-0 text-brand-500 dark:text-accent" />
              <span class="flex-1">お問い合わせ</span>
            </a>
          </li>
        </ul>
      </div>

      <button
        type="button"
        class="flex items-center justify-center gap-2 rounded border border-brand-200 bg-white dark:bg-panel py-2 text-sm font-semibold text-brand-700 dark:text-accent hover:bg-brand-50 dark:hover:bg-accent/10"
        @click="onLogout"
      >
        <ArrowRightOnRectangleIcon class="h-4 w-4" />
        ログアウト
      </button>
    </div>
  </div>
</template>
