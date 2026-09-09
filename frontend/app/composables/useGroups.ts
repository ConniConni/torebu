interface Group {
  id: string
  name: string
  memberLimit: number
  inviteCode: string
  inviteExpiresAt: string | null
  createdAt: string
  updatedAt: string
  role: 'owner' | 'member'
}

interface GroupMember {
  userId: string
  displayName: string
  role: 'owner' | 'member'
  joinedAt: string
}

interface GroupDetail extends Group {
  members: GroupMember[]
}

interface GroupWorkoutSet {
  id: string
  setOrder: number
  weightKg: number | null
  reps: number
}

interface GroupWorkoutExercise {
  exerciseId: string
  name: string
  sets: GroupWorkoutSet[]
}

interface GroupWorkout {
  id: string
  userId: string
  displayName: string
  performedAt: string
  memo: string | null
  hasSets: boolean
  reactionCount: number
  reactedByMe: boolean
  commentCount: number
  exercises: GroupWorkoutExercise[]
}

type RankingPeriod = 'week' | 'month' | 'all'

interface GroupRankingEntry {
  userId: string
  displayName: string
  totalVolumeKg: number
  rank: number
}

interface GroupRanking {
  period: RankingPeriod
  ranking: GroupRankingEntry[]
}

interface WorkoutComment {
  id: string
  userId: string
  displayName: string
  body: string
  createdAt: string
}

// バックエンドが返すエラーコードを画面表示用の日本語メッセージに変換する
// （エラーコード自体は backend/src/routes/groups.ts 参照）
const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: '入力内容を確認してください',
  invalid_invite_code: '招待コードが正しくありません',
  invite_expired: 'この招待コードは有効期限が切れています。オーナーに再発行を依頼してください',
  member_limit_exceeded: 'このグループは定員に達しています',
  sole_owner_cannot_leave:
    'オーナーが自分だけのグループは退会できません。先に他のメンバーをオーナーにするか、グループを削除してください',
  forbidden: 'この操作はオーナーのみ行えます',
  not_found: 'グループが見つかりませんでした',
}

export function groupErrorMessage(error: unknown): string {
  const code = (error as { data?: { error?: string } })?.data?.error
  return (code && ERROR_MESSAGES[code]) || '通信に失敗しました。時間をおいて再度お試しください'
}

// Phase4: グループ一覧・作成・招待コード参加・メンバー管理
export function useGroups() {
  const groups = useState<Group[] | null>('groups', () => null)
  const pending = ref(false)
  const error = ref(false)
  // SSR時、素の$fetchだとブラウザから来たCookieが転送されずログイン判定を誤る
  // （useAuth.tsのfetchMeと同じ理由。frontend/app/composables/useAuth.ts参照）
  const requestFetch = useRequestFetch()

  async function fetchGroups() {
    pending.value = true
    error.value = false
    try {
      groups.value = await requestFetch<Group[]>('/api/groups')
    } catch {
      error.value = true
    } finally {
      pending.value = false
    }
  }

  async function createGroup(name: string) {
    const group = await $fetch<Group>('/api/groups', { method: 'POST', body: { name } })
    groups.value = [group, ...(groups.value ?? [])]
    return group
  }

  async function fetchGroupDetail(id: string) {
    // 一覧(fetchGroups)と同じ理由でrequestFetchを使う。$fetchのままだとSSR時にCookieが
    // 転送されず401になり、クライアント再取得後の内容とSSRの内容がずれてハイドレーション
    // ミスマッチを起こす（2026-09-08、コンソールエラーの調査で発覚）
    return await requestFetch<GroupDetail>(`/api/groups/${id}`)
  }

  async function fetchGroupWorkouts(id: string) {
    return await requestFetch<GroupWorkout[]>(`/api/groups/${id}/workouts`)
  }

  // ランキング(Phase4)。週間/月間/通算はタブ切り替えのたびに都度取得し直す
  async function fetchGroupRanking(id: string, period: RankingPeriod) {
    return await requestFetch<GroupRanking>(`/api/groups/${id}/ranking`, { query: { period } })
  }

  // いいね(Phase4)。対象はworkout単体のためgroupsではなくworkoutsのエンドポイントを叩く
  // （backend/src/routes/workouts.ts参照。認可は「所属グループで同席しているか」で判定される）
  async function likeWorkout(workoutId: string) {
    return await $fetch<{ reactionCount: number; reactedByMe: boolean }>(
      `/api/workouts/${workoutId}/reactions`,
      { method: 'POST' },
    )
  }

  async function unlikeWorkout(workoutId: string) {
    return await $fetch<{ reactionCount: number; reactedByMe: boolean }>(
      `/api/workouts/${workoutId}/reactions`,
      { method: 'DELETE' },
    )
  }

  // コメント(Phase4)。いいねと同様workoutsのエンドポイントを叩く
  async function fetchComments(workoutId: string) {
    return await $fetch<WorkoutComment[]>(`/api/workouts/${workoutId}/comments`)
  }

  async function postComment(workoutId: string, body: string) {
    return await $fetch<WorkoutComment>(`/api/workouts/${workoutId}/comments`, {
      method: 'POST',
      body: { body },
    })
  }

  async function deleteComment(workoutId: string, commentId: string) {
    await $fetch(`/api/workouts/${workoutId}/comments/${commentId}`, { method: 'DELETE' })
  }

  async function reissueInvite(id: string) {
    return await $fetch<Group>(`/api/groups/${id}/invite`, { method: 'POST' })
  }

  async function joinGroup(inviteCode: string) {
    const group = await $fetch<Group>('/api/groups/join', { method: 'POST', body: { inviteCode } })
    // 既に一覧に無ければ追加する（退会後の再参加等で既に持っていた場合は上書き）
    const others = (groups.value ?? []).filter((g) => g.id !== group.id)
    groups.value = [group, ...others]
    return group
  }

  async function leaveGroup(id: string) {
    await $fetch(`/api/groups/${id}/leave`, { method: 'POST' })
    groups.value = (groups.value ?? []).filter((g) => g.id !== id)
  }

  async function deleteGroup(id: string) {
    await $fetch(`/api/groups/${id}`, { method: 'DELETE' })
    groups.value = (groups.value ?? []).filter((g) => g.id !== id)
  }

  return {
    groups,
    pending,
    error,
    fetchGroups,
    createGroup,
    fetchGroupDetail,
    fetchGroupWorkouts,
    fetchGroupRanking,
    likeWorkout,
    unlikeWorkout,
    fetchComments,
    postComment,
    deleteComment,
    reissueInvite,
    joinGroup,
    leaveGroup,
    deleteGroup,
  }
}

export type {
  Group,
  GroupDetail,
  GroupMember,
  GroupWorkout,
  GroupWorkoutExercise,
  GroupWorkoutSet,
  GroupRanking,
  GroupRankingEntry,
  RankingPeriod,
  WorkoutComment,
}
