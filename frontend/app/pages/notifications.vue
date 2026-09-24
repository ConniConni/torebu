<script setup lang="ts">
// Phase4: 通知一覧（#144）。自分の記録への「いいね」「コメント」、グループへの新メンバー参加（#249）、
// 仲間の自己ベスト更新（#253）の通知を表示する。種類ごとの文面・アイコン・遷移先は下の関数で出し分ける。
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
  if (n.target.type === 'personal_best')
    return `${actorName}さんが${n.target.exerciseName}で自己ベスト更新！`
  if (n.target.type === 'milestone')
    return `${actorName}さんが通算${n.target.days}日目のトレーニング！`
  if (n.target.type === 'comeback') return `${actorName}さん、久しぶりのトレーニング！`
  if (n.type === 'member_joined') return `${actorName}さんがグループに参加しました`
  if (n.type === 'reaction') return `${actorName}さんがあなたの記録にいいねしました`
  if (n.type === 'comment_reply')
    return `${actorName}さんが、あなたもコメントした記録にコメントしました`
  return `${actorName}さんがあなたの記録にコメントしました`
}

// 文面の下に出す補足（記録の通知は対象の記録の日付・種目、グループの通知はグループ名、
// 自己ベストは記録の日付と重量、通算の節目・久しぶりの復帰は記録の日付）
function targetSummary(n: AppNotification) {
  if (n.target.type === 'group') return n.target.groupName
  if (n.target.type === 'personal_best')
    return `${n.target.performedAt}の記録・${n.target.weightKg}kg`
  if (n.target.type === 'milestone' || n.target.type === 'comeback')
    return `${n.target.performedAt}の記録`
  const { performedAt, exerciseName, exerciseCount } = n.target
  if (!exerciseName) return `${performedAt}の記録・記録内容はまだありません`
  const rest = exerciseCount - 1
  return `${performedAt}の記録・${rest > 0 ? `${exerciseName} 他${rest}種目` : exerciseName}`
}

// 新メンバー参加はグループ画面へ遷移する。自己ベスト更新・通算の節目・久しぶりの復帰はその記録が
// 見えるグループの記録フィードへ遷移する（共通のグループが無い通知はAPIが返さないため、
// フォールバックは不要）。
// いいね・コメントはグループの記録フィード上でのみ見える(自分の記録画面には表示されない)ため、
// 遷移先はフィード側を優先する。actorが既に共通のグループを退会している等でgroupIdが無い場合のみ、
// 自分の記録画面（/workouts/new）にフォールバックする
function targetLink(n: AppNotification) {
  if (n.target.type === 'group') return `/groups/${n.target.groupId}`
  if (
    n.target.type === 'personal_best' ||
    n.target.type === 'milestone' ||
    n.target.type === 'comeback' ||
    n.target.groupId
  ) {
    return `/groups/${n.target.groupId}/workouts?workout=${n.target.workoutId}`
  }
  return `/workouts/new?date=${n.target.performedAt}`
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-surface px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <NuxtLink to="/" class="text-sm text-gray-500 dark:text-muted">← ホームに戻る</NuxtLink>
        <h1 class="text-base font-semibold text-gray-900 dark:text-ink">通知</h1>
      </div>

      <p v-if="pending" class="text-center text-sm text-gray-500 dark:text-muted">読み込み中...</p>
      <p v-else-if="loadError" class="text-center text-sm text-red-600 dark:text-red-400">
        通知の取得に失敗しました。時間をおいて再度お試しください
      </p>
      <p
        v-else-if="!notifications || notifications.length === 0"
        class="text-center text-sm text-gray-500 dark:text-muted"
      >
        通知はまだありません
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="n in notifications" :key="n.id">
          <NuxtLink
            :to="targetLink(n)"
            class="relative flex items-start gap-2.5 rounded-lg p-3 shadow"
            :class="n.isRead ? 'bg-white dark:bg-panel' : 'bg-brand-50 dark:bg-accent/10'"
          >
            <span
              v-if="!n.isRead"
              class="absolute top-3.5 right-3 h-1.5 w-1.5 rounded-full bg-brand-600 dark:bg-accent"
            />
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-accent/15 text-xs font-semibold text-brand-700 dark:text-accent"
            >
              {{ (n.actor?.displayName ?? '?').slice(0, 1) }}
            </span>
            <HeartIcon
              v-if="n.type === 'reaction'"
              filled
              class="mt-0.5 h-4.5 w-4.5 shrink-0"
              :class="
                n.isRead ? 'text-gray-400 dark:text-muted' : 'text-brand-600 dark:text-accent'
              "
            />
            <TrophyIcon
              v-else-if="n.type === 'personal_best'"
              class="mt-0.5 h-4.5 w-4.5 shrink-0"
              :class="
                n.isRead ? 'text-gray-400 dark:text-muted' : 'text-brand-600 dark:text-accent'
              "
            />
            <FlagIcon
              v-else-if="n.type === 'milestone'"
              class="mt-0.5 h-4.5 w-4.5 shrink-0"
              :class="
                n.isRead ? 'text-gray-400 dark:text-muted' : 'text-brand-600 dark:text-accent'
              "
            />
            <ArrowPathIcon
              v-else-if="n.type === 'comeback'"
              class="mt-0.5 h-4.5 w-4.5 shrink-0"
              :class="
                n.isRead ? 'text-gray-400 dark:text-muted' : 'text-brand-600 dark:text-accent'
              "
            />
            <GroupIcon
              v-else-if="n.type === 'member_joined'"
              class="mt-0.5 h-4.5 w-4.5 shrink-0"
              :class="
                n.isRead ? 'text-gray-400 dark:text-muted' : 'text-brand-600 dark:text-accent'
              "
            />
            <CommentIcon
              v-else
              class="mt-0.5 h-4.5 w-4.5 shrink-0"
              :class="
                n.isRead ? 'text-gray-400 dark:text-muted' : 'text-brand-600 dark:text-accent'
              "
            />
            <div class="min-w-0 flex-1">
              <p
                class="text-sm leading-relaxed"
                :class="n.isRead ? 'text-gray-700 dark:text-ink' : 'text-gray-900 dark:text-ink'"
              >
                {{ notificationText(n) }}
              </p>
              <p class="mt-0.5 truncate text-xs text-gray-500 dark:text-muted">
                {{ targetSummary(n) }}
              </p>
              <p class="mt-1 text-[11px] text-gray-400 dark:text-muted">
                {{ formatRelativeTime(n.createdAt) }}
              </p>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
