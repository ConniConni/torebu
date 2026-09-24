interface AuthUser {
  id: string
  email: string
  displayName: string
  // Issue #158より前に登録したユーザーはnullのままの場合がある
  gender: 'male' | 'female' | 'other' | 'no_answer' | null
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
  invalid_or_expired_token:
    'リンクの有効期限が切れているか、無効なリンクです。もう一度お試しください',
  invalid_current_password: '現在のパスワードが正しくありません',
  same_as_current_password: '現在と異なるパスワードを入力してください',
}

export function authErrorMessage(error: unknown): string {
  // レート制限（express-rate-limit）の429はエラーコードを返さないため、ステータスで判定する
  if ((error as { statusCode?: number })?.statusCode === 429) {
    return '試行回数が上限に達しました。しばらく時間をおいて再度お試しください'
  }
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

  // ログアウト後はフルリロード（external: true）で/loginへ遷移する（Issue #245）。
  // - 遷移前にuserをnullにすると、表示中の画面が「未ログイン状態」で再描画されてしまう
  //   （②ホームがWelcomeScreenに切り替わる、⑨マイページの表示名等が空になる等）ため、
  //   stateには一切触らずに遷移する。かといってSPA内遷移だとuserが残っているため、
  //   /loginのguestミドルウェアに「ログイン済み」とみなされて/へ戻されてしまう
  // - フルリロードでuseStateは全て初期化されるため、ユーザーに紐づくキャッシュ
  //   （種目・記録・ルーティン・グループ一覧等）が次にログインしたアカウントへ残ることもない
  //   （Issue #111。以前はSPA内遷移のため、ここで各useStateを明示的にリセットしていた）
  // location.hrefの変更後、navigateTo()のPromiseは解決しない（ページが破棄されるまで待つ）
  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await navigateTo('/login', { external: true })
  }

  // 常に同じレスポンスを返すAPI（メールアドレス列挙対策）のため、成否を返さず完了を示すのみ
  async function requestPasswordReset(email: string) {
    await $fetch('/api/auth/password-reset-requests', { method: 'POST', body: { email } })
  }

  async function resetPassword(token: string, password: string) {
    await $fetch('/api/auth/password-resets', { method: 'POST', body: { token, password } })
  }

  // ログイン中のパスワード変更（Issue #247）。変更後もログイン状態は維持され、userも変わらない
  async function changePassword(currentPassword: string, newPassword: string) {
    await $fetch('/api/auth/password-changes', {
      method: 'POST',
      body: { currentPassword, newPassword },
    })
  }

  return {
    user,
    fetchMe,
    register,
    login,
    logout,
    requestPasswordReset,
    resetPassword,
    changePassword,
  }
}
