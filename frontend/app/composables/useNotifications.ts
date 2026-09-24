interface NotificationActor {
  id: string
  displayName: string
}

// いいね・コメント(reaction/comment/comment_reply)の対象。記録(workout)
interface WorkoutNotificationTarget {
  type: 'workout'
  workoutId: string
  // いいね・コメントが見えるグループの記録フィードへのリンク用。actorと自分が現在も同席している
  // アクティブなグループが無ければnull(その場合フロントは自分の記録画面へフォールバックする)
  groupId: string | null
  performedAt: string
  exerciseName: string | null
  exerciseCount: number
}

// 新メンバー参加(member_joined)の対象。遷移先はグループ画面(Issue #249)
interface GroupNotificationTarget {
  type: 'group'
  groupId: string
  groupName: string
}

// 仲間の自己ベスト更新(personal_best)の対象(Issue #253)。種目名・重量は取得時点の値で、
// 重量はその記録のその種目の現在の最大重量。行為者と自分が今も同席しているグループがある場合のみ
// APIが返すため、groupIdは常にある(遷移先はそのグループの記録フィード)
interface PersonalBestNotificationTarget {
  type: 'personal_best'
  workoutId: string
  groupId: string
  performedAt: string
  exerciseId: string
  exerciseName: string
  weightKg: number
}

// 通算の節目(milestone)・久しぶりの復帰(comeback)の対象(Issue #255)。personal_bestと同様、
// 行為者と自分が今も同席しているグループがある場合のみAPIが返すため、groupIdは常にある
interface MilestoneNotificationTarget {
  type: 'milestone'
  workoutId: string
  groupId: string
  performedAt: string
  days: number
}
interface ComebackNotificationTarget {
  type: 'comeback'
  workoutId: string
  groupId: string
  performedAt: string
}

// 型名`Notification`はブラウザ標準のWeb Notifications APIとグローバルに衝突するため`AppNotification`にする
export interface AppNotification {
  id: string
  // comment_reply: 自分の記録ではないが、自分も過去にコメントしたworkoutに別の人がコメントしたときの通知(#149)
  // member_joined: 自分が所属するグループに誰かが参加(再参加含む)したときの通知(#249)。
  //   作成から5分経つまでAPIが返さない(表示の遅延はバックエンド側で行う)
  // personal_best: 同じグループの仲間が種目の自己ベスト(最大重量)を更新したときの通知(#253)。5分遅延はmember_joinedと同じ
  // milestone: 同じグループの仲間が通算の記録日数の節目に到達したときの通知(#255)。5分遅延は同上
  // comeback: 同じグループの仲間が久しぶりに記録したときの通知(#255)。5分遅延は同上
  type:
    | 'reaction'
    | 'comment'
    | 'comment_reply'
    | 'member_joined'
    | 'personal_best'
    | 'milestone'
    | 'comeback'
  isRead: boolean
  createdAt: string
  actor: NotificationActor | null
  target:
    | WorkoutNotificationTarget
    | GroupNotificationTarget
    | PersonalBestNotificationTarget
    | MilestoneNotificationTarget
    | ComebackNotificationTarget
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
