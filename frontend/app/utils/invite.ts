// グループ招待リンク(Issue #312)まわりの純粋関数

export function inviteLinkPath(inviteCode: string) {
  return `/invite/${inviteCode}`
}

// 「招待コードで参加」画面の入力欄に、招待リンクを丸ごと貼り付けられた場合でもコードを取り出す。
// 招待コードはbase64url([A-Za-z0-9_-])なので、/invite/ の後ろのその文字種だけを拾う
export function extractInviteCode(input: string) {
  const trimmed = input.trim()
  const match = trimmed.match(/\/invite\/([A-Za-z0-9_-]+)/)
  return match ? match[1]! : trimmed
}

// ログイン・新規登録後の戻り先(?redirect=)として使ってよい値かを判定し、使える場合はそのパスを返す。
// クエリはURLを知っていれば誰でも細工できるため、外部サイトへ飛ばされる(オープンリダイレクト)のを防ぐ。
// アプリ内の絶対パス("/"始まり)のみ許可し、プロトコル相対URL("//evil.example")や、ブラウザが
// "/"と同一視する"\"を使った"/\evil.example"は弾く
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//') || value.startsWith('/\\')) return null
  // 制御文字(タブ・改行など)はブラウザがURL解釈時に除去し"//"に化けうるため、含むものは一律弾く
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  return value
}
