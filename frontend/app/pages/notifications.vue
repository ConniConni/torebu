<script setup lang="ts">
// Phase4: 通知一覧（#144）。自分の記録への「いいね」「コメント」の通知を表示する。
// 開いた時点で自動的に全件既読にする（個別の既読トグルは設けない。docs/spec.mdの実装メモ参照）
definePageMeta({ middleware: 'auth' })

const { fetchNotifications, markAllAsRead } = useNotifications()

const notifications = ref<AppNotification[] | null>(null)
const pending = ref(true)
const loadError = ref(false)

async function load() {
  pending.value = true
  loadError.value = false
  try {
    // 既読化より先に一覧を取得することで、開いた瞬間の未読/既読の見た目（ハイライト）を
    // 取得時点のisReadで表示できる（既読化後に取得すると全件既読の見た目になってしまう）
    notifications.value = await fetchNotifications()
    await markAllAsRead()
  } catch {
    loadError.value = true
  } finally {
    pending.value = false
  }
}
await load()

function notificationText(n: AppNotification) {
  const actorName = n.actor?.displayName ?? '(退会済みのメンバー)'
  return n.type === 'reaction'
    ? `${actorName}さんがあなたの記録にいいねしました`
    : `${actorName}さんがあなたの記録にコメントしました`
}

function targetSummary(n: AppNotification) {
  const { exerciseName, exerciseCount } = n.target
  if (!exerciseName) return '記録内容はまだありません'
  const rest = exerciseCount - 1
  return rest > 0 ? `${exerciseName} 他${rest}種目` : exerciseName
}

// いいね・コメントはグループの記録フィード上でのみ見える(自分の記録画面には表示されない)ため、
// 遷移先はフィード側を優先する。actorが既に共通のグループを退会している等でgroupIdが無い場合のみ、
// 自分の記録画面（/workouts/new）にフォールバックする
function targetLink(n: AppNotification) {
  if (n.target.groupId) {
    return `/groups/${n.target.groupId}/workouts?workout=${n.target.workoutId}`
  }
  return `/workouts/new?date=${n.target.performedAt}`
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <NuxtLink to="/" class="text-sm text-gray-500">← ホームに戻る</NuxtLink>
        <h1 class="text-base font-semibold text-gray-900">通知</h1>
      </div>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="loadError" class="text-center text-sm text-red-600">
        通知の取得に失敗しました。時間をおいて再度お試しください
      </p>
      <p
        v-else-if="!notifications || notifications.length === 0"
        class="text-center text-sm text-gray-500"
      >
        通知はまだありません
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="n in notifications" :key="n.id">
          <NuxtLink
            :to="targetLink(n)"
            class="relative flex items-start gap-2.5 rounded-lg p-3 shadow"
            :class="n.isRead ? 'bg-white' : 'bg-brand-50'"
          >
            <span
              v-if="!n.isRead"
              class="absolute top-3.5 right-3 h-1.5 w-1.5 rounded-full bg-brand-600"
            />
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
            >
              {{ (n.actor?.displayName ?? '?').slice(0, 1) }}
            </span>
            <HeartIcon
              v-if="n.type === 'reaction'"
              filled
              class="mt-0.5 h-4.5 w-4.5 shrink-0"
              :class="n.isRead ? 'text-gray-400' : 'text-brand-600'"
            />
            <CommentIcon
              v-else
              class="mt-0.5 h-4.5 w-4.5 shrink-0"
              :class="n.isRead ? 'text-gray-400' : 'text-brand-600'"
            />
            <div class="min-w-0 flex-1">
              <p
                class="text-sm leading-relaxed"
                :class="n.isRead ? 'text-gray-700' : 'text-gray-900'"
              >
                {{ notificationText(n) }}
              </p>
              <p class="mt-0.5 truncate text-xs text-gray-500">
                {{ n.target.performedAt }}の記録・{{ targetSummary(n) }}
              </p>
              <p class="mt-1 text-[11px] text-gray-400">{{ formatRelativeTime(n.createdAt) }}</p>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
