interface NotificationActor {
  id: string
  displayName: string
}

interface NotificationTarget {
  type: 'workout'
  workoutId: string
  // いいね・コメントが見えるグループの記録フィードへのリンク用。actorと自分が現在も同席している
  // アクティブなグループが無ければnull(その場合フロントは自分の記録画面へフォールバックする)
  groupId: string | null
  performedAt: string
  exerciseName: string | null
  exerciseCount: number
}

// 型名`Notification`はブラウザ標準のWeb Notifications APIとグローバルに衝突するため`AppNotification`にする
export interface AppNotification {
  id: string
  // comment_reply: 自分の記録ではないが、自分も過去にコメントしたworkoutに別の人がコメントしたときの通知(#149)
  type: 'reaction' | 'comment' | 'comment_reply'
  isRead: boolean
  createdAt: string
  actor: NotificationActor | null
  target: NotificationTarget
}

// Phase4: 通知(#144)。ポーリングはせず、画面遷移・読み込み時にAPIを叩くだけの方式
// （docs/schema.md「Phase4の検討結果」参照）
export function useNotifications() {
  const unreadCount = useState<number>('notificationsUnreadCount', () => 0)
  // SSR時、素の$fetchだとブラウザから来たCookieが転送されずログイン判定を誤る
  // （useAuth.tsのfetchMeと同じ理由。frontend/app/composables/useGroups.ts参照）
  const requestFetch = useRequestFetch()

  async function fetchUnreadCount() {
    try {
      const res = await requestFetch<{ count: number }>('/api/notifications/unread-count')
      unreadCount.value = res.count
    } catch {
      // バッジ表示のための取得なので、失敗しても画面を止めない（表示は0のまま）
    }
  }

  async function fetchNotifications() {
    return await requestFetch<AppNotification[]>('/api/notifications')
  }

  async function markAllAsRead() {
    await $fetch('/api/notifications/read', { method: 'POST' })
    unreadCount.value = 0
  }

  return { unreadCount, fetchUnreadCount, fetchNotifications, markAllAsRead }
}
