// Sentry（エラー監視、Issue #403）へ送る前に、個人情報・秘密の値を落とす純粋関数。
// backendのsrc/sentry.tsと同じ方針（送る内容は docs/spec.md §6 参照）
import type { Breadcrumb, ErrorEvent } from '@sentry/vue'

// URLに含まれる秘密の値を伏せ、クエリ（?redirect=に招待ページのURLが入ることがある）とハッシュも落とす。
// /invite/:code と /groups/invites/:code は招待コード、/password-reset/:token はパスワード再設定トークン
export function maskUrl(url: string) {
  return url
    .split(/[?#]/)[0]!
    .replace(/(\/invites?\/)[^/]+/g, '$1[masked]')
    .replace(/(\/password-reset\/)[^/]+/g, '$1[masked]')
}

// エラーメッセージに紛れ込むメールアドレスを伏せる
export function maskText(text: string) {
  return text.replace(/[^\s@"'`<>(){}[\],;:]+@[^\s@"'`<>(){}[\],;:]+\.[A-Za-z]{2,}/g, '[email]')
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    // 発生したページのURL（伏せたもの）と、ブラウザの種類を知るためのUser-Agentだけを残す。
    // Refererには直前のページのURL（再設定トークン入りのことがある）が入るため送らない
    const userAgent = event.request.headers?.['User-Agent']
    event.request = {
      url: event.request.url ? maskUrl(event.request.url) : undefined,
      headers: userAgent ? { 'User-Agent': userAgent } : undefined,
    }
  }
  delete event.user
  // Vueのエラーハンドラが添付するコンポーネントのprops（plugins/sentry.client.tsのattachProps: falseで
  // 止めているが、念のため）。コンポーネント名・階層は残す
  if (event.contexts?.vue) delete event.contexts.vue.propsData
  if (event.transaction) event.transaction = maskUrl(event.transaction)
  if (event.message) event.message = maskText(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = maskText(exception.value)
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = maskUrl(frame.filename)
      if (frame.abs_path) frame.abs_path = maskUrl(frame.abs_path)
    }
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb).filter((b) => b !== null)
  return event
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // console.logの内容には何が入るか分からないため送らない
  if (breadcrumb.category === 'console') return null
  const data = breadcrumb.data && { ...breadcrumb.data }
  if (data) {
    // fetch/XHRはurl、画面遷移はfrom/toにURLが入る
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string') data[key] = maskUrl(data[key])
    }
  }
  return {
    ...breadcrumb,
    message: breadcrumb.message ? maskText(breadcrumb.message) : undefined,
    data,
  }
}
