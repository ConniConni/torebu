// エラー監視（Sentry、Issue #403）。本番の不具合に気づけるよう、500系のエラーをSentryへ送る。
// 個人情報を送らないことを最優先にし、SDK任せにせず送信直前（beforeSend）で必要な情報以外を落とす。
// 送る内容の方針は docs/spec.md §6 を参照
import * as Sentry from '@sentry/node'
import type { Breadcrumb, ErrorEvent, NodeOptions } from '@sentry/node'
import type { ErrorRequestHandler } from 'express'

// URLに含まれる秘密の値（招待コード）を伏せる。招待コードを知っている人だけがグループ情報を引けるため
export function maskUrl(url: string) {
  return url.replace(/(\/invites\/)[^/?#]+/g, '$1[masked]')
}

// エラーメッセージに紛れ込む個人情報を伏せる。Prismaの検証エラーなどは呼び出し時の引数（メールアドレスや
// パスワードハッシュ）をそのままメッセージに含めることがあるため
export function maskText(text: string) {
  return text
    .replace(/[^\s@"'`<>(){}[\],;:]+@[^\s@"'`<>(){}[\],;:]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[bcrypt-hash]')
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    // リクエストボディ（パスワード・メールアドレス）、Cookie（セッションID）、ヘッダー、クエリは送らない。
    // 何が起きたかはメソッドとURLのパスがあれば追える
    event.request = {
      method: event.request.method,
      url: event.request.url ? maskUrl(event.request.url.split('?')[0]!) : undefined,
    }
  }
  delete event.user
  if (event.transaction) event.transaction = maskUrl(event.transaction)
  if (event.message) event.message = maskText(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = maskText(exception.value)
  }
  // パンくずリストは送信前のbeforeBreadcrumbで絞っているが、念のためここでもURLとメッセージを伏せる
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb).filter((b) => b !== null)
  return event
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // console.logの内容には何が入るか分からない（ローカルではパスワード再設定URLを出している。lib/mail.ts）
  if (breadcrumb.category === 'console') return null
  const data = breadcrumb.data
  return {
    ...breadcrumb,
    message: breadcrumb.message ? maskText(breadcrumb.message) : undefined,
    data:
      data && typeof data.url === 'string'
        ? { ...data, url: maskUrl(data.url.split('?')[0]!) }
        : data,
  }
}

// DSN未設定（ローカル開発・CI）とテスト実行時は初期化せず、何も送らない。
// overridesはテストで送信先（transport）を差し替えて送信内容を検査するためのもの
export function initSentry(overrides: Partial<NodeOptions> = {}) {
  const dsn = overrides.dsn ?? process.env.SENTRY_DSN
  if (!dsn || (process.env.NODE_ENV === 'test' && !overrides.dsn)) return
  Sentry.init({
    dsn,
    // Vercelが自動で設定する（production / preview）。それ以外はローカルからの手動送信とみなす
    environment: process.env.VERCEL_ENV ?? 'development',
    // SDK v11では旧`sendDefaultPii`がこの`dataCollection`に置き換わり、既定では本文・ヘッダー・Cookie・
    // IPアドレス・例外発生時のローカル変数まで集める（実際に既定のままだとログインのボディが送られることを
    // テストで確認した）。必要なもの以外はすべて集めない設定にし、さらにbeforeSendでも落とす二重の守りにする
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
    },
    includeLocalVariables: false,
    // 性能計測（トレース）は使わない。エラーだけを送る
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    ...overrides,
  })
}

// ルートより後ろに置くエラーハンドラ。500系のエラーだけを送り、その後はExpress既定のハンドラに任せる
// （レスポンスの形は従来どおり）。Vercelの関数はレスポンスを返すと止まり、送信途中のイベントが
// 失われるため、レスポンスを返す前にflushで送信完了を待つ（最大2秒。未初期化ならすぐ終わる）
export const sentryErrorHandler: ErrorRequestHandler = async (err, _req, _res, next) => {
  const status = (err as { status?: unknown; statusCode?: unknown })?.status ?? err?.statusCode
  if (typeof status !== 'number' || status >= 500) {
    Sentry.captureException(err)
    await Sentry.flush(2000)
  }
  next(err)
}
