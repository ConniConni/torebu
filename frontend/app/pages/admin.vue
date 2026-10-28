<script setup lang="ts">
// 運営向けの集計画面（Issue #401）。アプリ内からはリンクせず、URLを直接開いて使う。
// 管理者かどうかはバックエンド（環境変数ADMIN_USER_IDS）が判定し、管理者以外にはAPIが404を返すため、
// その場合はこの画面も404にする（管理用の画面があること自体を見せない）
definePageMeta({ middleware: 'auth' })

interface AdminStats {
  users: { total: number; last7Days: number; last30Days: number; viaShare: number }
  activeUsers: { last7Days: number; last30Days: number }
  groups: { total: number }
  workouts: { total: number; last7Days: number }
  reactions: { total: number; last7Days: number }
  comments: { total: number; last7Days: number }
}

const requestFetch = useRequestFetch()
const stats = ref<AdminStats | null>(null)
const loadError = ref(false)

try {
  stats.value = await requestFetch<AdminStats>('/api/admin/stats')
} catch (error) {
  if ((error as { statusCode?: number }).statusCode === 404) {
    throw createError({ statusCode: 404, statusMessage: 'Page Not Found', fatal: true })
  }
  loadError.value = true
}

// カードごとに並べる数値（見出し・ラベル・値）
const sections = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    {
      title: '登録人数',
      items: [
        { label: '累計', value: s.users.total },
        { label: '直近7日', value: s.users.last7Days },
        { label: '直近30日', value: s.users.last30Days },
        { label: 'シェア経由（累計）', value: s.users.viaShare },
      ],
    },
    {
      title: '記録したユーザー',
      items: [
        { label: '直近7日', value: s.activeUsers.last7Days },
        { label: '直近30日', value: s.activeUsers.last30Days },
      ],
    },
    {
      title: '記録',
      items: [
        { label: '累計', value: s.workouts.total },
        { label: '直近7日', value: s.workouts.last7Days },
      ],
    },
    {
      title: '交流',
      items: [
        { label: 'グループ数', value: s.groups.total },
        { label: 'いいね（累計）', value: s.reactions.total },
        { label: 'いいね（直近7日）', value: s.reactions.last7Days },
        { label: 'コメント（累計）', value: s.comments.total },
        { label: 'コメント（直近7日）', value: s.comments.last7Days },
      ],
    },
  ]
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-surface">
    <PageHeader back-to="/" back-label="ホームに戻る" title="運営用の集計" />
    <div class="px-4 pb-6">
      <div class="mx-auto flex max-w-sm flex-col gap-4">
        <p v-if="loadError" class="text-center text-sm text-red-600 dark:text-red-400">
          集計の取得に失敗しました。時間をおいて再度お試しください
        </p>
        <template v-else>
          <section
            v-for="section in sections"
            :key="section.title"
            class="rounded-lg bg-white p-4 shadow dark:bg-panel"
          >
            <h2 class="mb-2 text-sm font-semibold text-gray-900 dark:text-ink">
              {{ section.title }}
            </h2>
            <dl class="grid grid-cols-2 gap-3">
              <div v-for="item in section.items" :key="item.label">
                <dt class="text-xs text-gray-500 dark:text-muted">{{ item.label }}</dt>
                <dd class="text-xl font-bold text-gray-900 tabular-nums dark:text-ink">
                  {{ item.value.toLocaleString() }}
                </dd>
              </div>
            </dl>
          </section>
          <p class="text-xs text-gray-500 dark:text-muted">
            「直近7日/30日」は今からさかのぼった期間。記録したユーザーは、その期間に記録を作った人数
            （トレーニングの日付ではなく、記録した日時で数える）。削除済みの記録・グループは含まない
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
