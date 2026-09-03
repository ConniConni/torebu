interface AuthUser {
  id: string
  email: string
  displayName: string
}

interface RegisterPayload {
  email: string
  password: string
  displayName: string
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

  // 現在のログイン状態をサーバーに問い合わせて反映する
  async function fetchMe() {
    try {
      user.value = await $fetch<AuthUser>('/api/auth/me')
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
  }

  return { user, fetchMe, register, login, logout }
}
