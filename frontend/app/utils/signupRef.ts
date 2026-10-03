// 登録のきっかけ（Issue #314、効果測定用）。画像カードシェアの共有URL（/?ref=share）で
// トップに来た人が、そのまま新規登録したかを後から確かめるために使う。
// トップ→新規登録の間でクエリが消えるため、トップで受け取った値をsessionStorageに一時保存し、
// 登録時にPOST /auth/registerのsignupRefとして送る。保存先がブラウザのタブ単位なので、
// 別タブ・別端末で登録した場合は記録されない（あくまで目安の計測と割り切る）

import { SHARE_SIGNUP_REF } from './shareCard'

export type SignupRef = typeof SHARE_SIGNUP_REF

const STORAGE_KEY = 'torebu:signupRef'

// クエリは誰でも細工できるため、許可した値だけを通す（バックエンドも同じく許可リストで検証する）
export function parseSignupRef(value: unknown): SignupRef | null {
  return value === SHARE_SIGNUP_REF ? value : null
}

// sessionStorageはプライベートブラウズ等で例外になりうるため、失敗しても登録自体は妨げない
export function saveSignupRef(value: unknown) {
  const ref = parseSignupRef(value)
  if (!ref) return
  try {
    sessionStorage.setItem(STORAGE_KEY, ref)
  } catch {
    // 計測できないだけなので無視する
  }
}

export function loadSignupRef(): SignupRef | null {
  try {
    return parseSignupRef(sessionStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}
