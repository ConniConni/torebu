<script setup lang="ts">
// ⑨マイページ（Issue #237）。ユーザー情報の集約・サポート情報への導線をまとめる画面。
// グループPro・ダークモード（アプリの見た目）、パスワード変更（アカウント）は
// Stripe連携・新規APIの実装がそれぞれ別Issueになるため、今回は「準備中」の非活性表示のみ置く
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
      (workouts.value ?? []).map((w) => w.performedAt),
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

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6 pb-24">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <NuxtLink to="/" class="text-sm text-gray-500">← ホームに戻る</NuxtLink>
        <h1 class="text-base font-semibold text-gray-900">マイページ</h1>
      </div>

      <!-- プロフィール表示（表示のみ、編集機能は持たない。docs/backlog.md参照） -->
      <div class="flex items-center gap-3 rounded-lg bg-white p-4 shadow">
        <span
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700"
        >
          {{ (user?.displayName ?? '?').slice(0, 1) }}
        </span>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-gray-900">{{ user?.displayName }}</p>
          <p class="truncate text-xs text-gray-500">{{ user?.email }}</p>
        </div>
      </div>

      <!-- 実績サマリー（直近28日、既存GET /stats/volume・GET /workoutsを流用） -->
      <div class="rounded-lg bg-white p-4 shadow">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-gray-900">直近28日の実績</p>
          <NuxtLink to="/stats" class="text-sm text-brand-600">統計を見る →</NuxtLink>
        </div>
        <p v-if="summaryPending" class="text-xs text-gray-400">読み込み中...</p>
        <p v-else-if="summaryError" class="text-xs text-red-600">サマリーの取得に失敗しました</p>
        <div v-else class="grid grid-cols-2 gap-2">
          <div class="rounded bg-gray-50 p-2.5">
            <p class="text-xs text-gray-500">負荷重量</p>
            <p class="text-xl font-bold tabular-nums text-gray-900">
              {{ formatTons(recentVolumeKg) }}
            </p>
          </div>
          <div class="rounded bg-gray-50 p-2.5">
            <p class="text-xs text-gray-500">トレ日数</p>
            <p class="text-xl font-bold tabular-nums text-gray-900">{{ recentTrainingDays }}日</p>
          </div>
        </div>
      </div>

      <!-- 所属グループ一覧（既存GET /groupsを流用。名前・人数・自分の役割のみ、課金ボタンは
           含めない。docs/backlog.md参照） -->
      <div class="rounded-lg bg-white p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900">所属グループ</p>
        <p v-if="groupsPending" class="text-xs text-gray-400">読み込み中...</p>
        <p v-else-if="groupsError" class="text-xs text-red-600">
          グループの取得に失敗しました
        </p>
        <div v-else-if="!groups || groups.length === 0">
          <p class="mb-2 text-xs text-gray-500">所属しているグループはありません</p>
          <NuxtLink
            to="/groups"
            class="block rounded bg-brand-600 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700"
          >
            グループを作成・参加する
          </NuxtLink>
        </div>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="group in groups" :key="group.id">
            <NuxtLink
              :to="`/groups/${group.id}`"
              class="flex items-center gap-3 rounded border border-gray-200 px-3 py-2 hover:bg-gray-50"
            >
              <GroupIcon class="h-5 w-5 shrink-0 text-gray-400" />
              <div class="min-w-0">
                <p class="truncate text-sm text-gray-900">{{ group.name }}</p>
                <p class="text-xs text-gray-500">
                  {{ group.memberCount }}人 ・ {{ ROLE_LABEL[group.role] }}
                </p>
              </div>
            </NuxtLink>
          </li>
        </ul>
      </div>

      <!-- アプリの見た目（ダークモード）。グループPro・個人テーマ購入はStripe連携着手の
           Issueで実装するため、それまでは「準備中」の非活性表示にする（docs/backlog.md参照） -->
      <div class="rounded-lg bg-white p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900">アプリの見た目</p>
        <div class="flex items-center gap-3 rounded border border-gray-100 px-3 py-2">
          <MoonIcon class="h-5 w-5 shrink-0 text-gray-300" />
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-400">ダークモード</p>
          </div>
          <span class="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs text-gray-500"
            >準備中</span
          >
        </div>
      </div>

      <!-- アカウント（パスワード変更）。現在ログイン中にその場で変更するAPIが無く新規実装が
           必要なため、別Issueに切り出す。それまでは「準備中」の非活性表示にする（docs/backlog.md参照） -->
      <div class="rounded-lg bg-white p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900">アカウント</p>
        <div class="flex items-center gap-3 rounded border border-gray-100 px-3 py-2">
          <LockClosedIcon class="h-5 w-5 shrink-0 text-gray-300" />
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-400">パスワードを変更</p>
          </div>
          <span class="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs text-gray-500"
            >準備中</span
          >
        </div>
      </div>

      <!-- サポート・情報（バージョン表示は持たない。docs/backlog.md参照） -->
      <div class="rounded-lg bg-white p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900">サポート・情報</p>
        <ul class="flex flex-col divide-y divide-gray-100 text-sm text-gray-700">
          <li>
            <NuxtLink to="/terms" class="flex items-center gap-3 py-2">
              <InfoIcon class="h-5 w-5 shrink-0 text-gray-400" />
              <span class="flex-1">利用規約</span>
              <ChevronRightIcon class="h-4 w-4 shrink-0 text-gray-300" />
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/privacy" class="flex items-center gap-3 py-2">
              <InfoIcon class="h-5 w-5 shrink-0 text-gray-400" />
              <span class="flex-1">プライバシーポリシー</span>
              <ChevronRightIcon class="h-4 w-4 shrink-0 text-gray-300" />
            </NuxtLink>
          </li>
          <li>
            <a href="mailto:torebu1442@gmail.com" class="flex items-center gap-3 py-2">
              <EnvelopeIcon class="h-5 w-5 shrink-0 text-gray-400" />
              <span class="flex-1">お問い合わせ</span>
            </a>
          </li>
        </ul>
      </div>

      <button
        type="button"
        class="flex items-center justify-center gap-2 rounded bg-gray-200 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-300"
        @click="onLogout"
      >
        <ArrowRightOnRectangleIcon class="h-4 w-4" />
        ログアウト
      </button>
    </div>
  </div>
</template>
