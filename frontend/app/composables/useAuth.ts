interface AuthUser {
  id: string
  email: string
  displayName: string
}

interface RegisterPayload {
  email: string
  password: string
  displayName: string
  birthYearMonth: 'no_answer' | { year: number; month: number }
  gender: 'male' | 'female' | 'other' | 'no_answer'
  occupation:
    | 'student'
    | 'company_employee'
    | 'self_employed'
    | 'executive'
    | 'homemaker'
    | 'other'
    | 'no_answer'
}

interface LoginPayload {
  email: string
  password: string
}

// バックエンドが返すエラーコードを画面表示用の日本語メッセージに変換する
// （エラーコード自体は backend/src/routes/auth.ts 参照）
const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: '入力内容を確認してください',
  email_already_registered: 'このメールアドレスは既に登録されています',
  invalid_credentials: 'メールアドレスまたはパスワードが正しくありません',
}

export function authErrorMessage(error: unknown): string {
  const code = (error as { data?: { error?: string } })?.data?.error
  return (code && ERROR_MESSAGES[code]) || '通信に失敗しました。時間をおいて再度お試しください'
}

// ログイン中のユーザー情報。ページ・コンポーネント間で共有するためuseStateで保持する
export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)
  // SSR時、素の$fetchだとブラウザから来たCookieが転送されずログイン状態を正しく判定できない。
  // useRequestFetch()はサーバー実行時のみリクエストヘッダー（Cookie含む）を自動転送してくれる
  const requestFetch = useRequestFetch()

  // 現在のログイン状態をサーバーに問い合わせて反映する
  async function fetchMe() {
    try {
      user.value = await requestFetch<AuthUser>('/api/auth/me')
    } catch {
      user.value = null
    }
    return user.value
  }

  // 登録APIはユーザー作成のみでログイン状態にはならないため、登録後に続けてログインする
  async function register(payload: RegisterPayload) {
    await $fetch('/api/auth/register', { method: 'POST', body: payload })
    return login({ email: payload.email, password: payload.password })
  }

  async function login(payload: LoginPayload) {
    user.value = await $fetch<AuthUser>('/api/auth/login', { method: 'POST', body: payload })
    return user.value
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    resetUserState()
  }

  return { user, fetchMe, register, login, logout }
}

// ユーザーに紐づくキャッシュ(useState)を初期値に戻す。ログアウト→ログインはnavigateTo()による
// SPA内遷移(フルリロード無し)のため、ここで明示的にリセットしないと、各ページの
// 「まだ取得済みでなければfetchする」実装(if (!exercises.value)等)により、
// 同じブラウザタブで別アカウントにログインし直したとき前のユーザーのデータが
// 残ったまま表示されてしまう(Issue #111)。
// useStateはキーで共有される単一のrefのため、各composable側の初期値と同じ値を入れ直せばよい
function resetUserState() {
  useState<unknown[] | null>('exercises', () => null).value = null
  useState<unknown[] | null>('workouts', () => null).value = null
  useState<unknown[] | null>('routines', () => null).value = null
  useState<unknown[] | null>('groups', () => null).value = null
  useState<unknown[]>('pending-exercises', () => []).value = []
  useState<string | null>('picked-exercise-id', () => null).value = null
  useState('workout-session', () => ({
    workoutId: null as string | null,
    performedAt: null as string | null,
    sets: [] as unknown[],
    memo: null as string | null,
  })).value = { workoutId: null, performedAt: null, sets: [], memo: null }
}
