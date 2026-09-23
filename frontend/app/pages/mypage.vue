<script setup lang="ts">
// ⑨マイページ（Issue #237）。ユーザー情報の集約・サポート情報への導線をまとめる画面。
// グループPro・ダークモードの導線はStripe連携着手のIssueで追加する（今は「押しても何も起きない
// ボタン」になってしまうため対象外にした。docs/backlog.md「マイページ（⑨）の新設・設計」参照）
definePageMeta({ middleware: 'auth' })

const { user, logout } = useAuth()
const { groups, pending: groupsPending, error: groupsError, fetchGroups } = useGroups()
const { fetchVolume } = useStats()

if (!groups.value) {
  await fetchGroups()
}

// 実績サマリーは直近28日のみ（②ホームの期間別サマリーカードと違い期間タブは持たない、
// docs/backlog.md参照）。既存GET /stats/volume（range=all）をフロントで直近28日分に集計する
const today = todayLocalDateString()
const recentVolumeKg = ref(0)
const volumePending = ref(true)
const volumeError = ref(false)

async function loadRecentVolume() {
  volumePending.value = true
  volumeError.value = false
  try {
    const points = await fetchVolume('all')
    recentVolumeKg.value = sumRecentVolume(points, today, 28)
  } catch {
    volumeError.value = true
  } finally {
    volumePending.value = false
  }
}
await loadRecentVolume()

const recentAnimalCaption = computed(() => animalCaption(recentVolumeKg.value))

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

      <!-- 実績サマリー（直近28日、既存GET /stats/volumeを流用） -->
      <div class="rounded-lg bg-white p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900">実績サマリー（直近28日）</p>
        <p v-if="volumePending" class="text-xs text-gray-400">読み込み中...</p>
        <p v-else-if="volumeError" class="text-xs text-red-600">サマリーの取得に失敗しました</p>
        <div v-else>
          <p class="text-2xl font-extrabold leading-none tabular-nums text-brand-700">
            {{ formatTons(recentVolumeKg) }}
          </p>
          <div v-if="recentAnimalCaption" class="mt-1 flex items-center gap-1.5">
            <span class="shrink-0 whitespace-nowrap text-xs font-semibold text-gray-500"
              >負荷重量</span
            >
            <SeaAnimalIcon
              :name="recentAnimalCaption.animalKey"
              :alt="recentAnimalCaption.animalName"
              class="h-6 w-9 shrink-0"
            />
            <span class="whitespace-nowrap text-xs font-semibold tabular-nums text-gray-500">
              × {{ recentAnimalCaption.multiplierText }}
            </span>
          </div>
          <p v-else class="mt-1 text-xs text-gray-500">負荷重量</p>
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
        <p v-else-if="!groups || groups.length === 0" class="text-xs text-gray-500">
          所属しているグループはありません
        </p>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="group in groups" :key="group.id">
            <NuxtLink
              :to="`/groups/${group.id}`"
              class="flex items-center justify-between rounded border border-gray-200 px-3 py-2 hover:bg-gray-50"
            >
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

      <!-- サポート・情報（バージョン表示は持たない。docs/backlog.md参照） -->
      <div class="rounded-lg bg-white p-4 shadow">
        <p class="mb-2 text-sm font-semibold text-gray-900">サポート・情報</p>
        <ul class="flex flex-col divide-y divide-gray-100 text-sm text-gray-700">
          <li>
            <NuxtLink to="/terms" class="block py-2">利用規約</NuxtLink>
          </li>
          <li>
            <NuxtLink to="/privacy" class="block py-2">プライバシーポリシー</NuxtLink>
          </li>
          <li>
            <a href="mailto:torebu1442@gmail.com" class="block py-2">お問い合わせ</a>
          </li>
        </ul>
      </div>

      <button
        type="button"
        class="rounded bg-gray-200 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-300"
        @click="onLogout"
      >
        ログアウト
      </button>
    </div>
  </div>
</template>
