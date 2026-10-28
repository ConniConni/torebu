// ブラウザ側のエラー監視（Sentry、Issue #403）。Vueの描画・イベント処理中の例外と、未処理の例外を送る。
// frontendのサーバー側（Nitro）は/apiをbackendへ中継しているだけのため対象外（backendはbackend側で監視）。
// DSN（NUXT_PUBLIC_SENTRY_DSN）が未設定の環境（ローカル開発・CI）では何もしない
import * as Sentry from '@sentry/vue'
import { scrubBreadcrumb, scrubEvent } from '~/utils/sentryScrub'

export default defineNuxtPlugin((nuxtApp) => {
  const { sentryDsn, sentryEnvironment } = useRuntimeConfig().public
  if (!sentryDsn) return

  Sentry.init({
    app: nuxtApp.vueApp,
    dsn: sentryDsn,
    environment: sentryEnvironment,
    // SDK v11の既定ではユーザー情報・Cookie・ヘッダー・クエリまで集めるため、必要なもの以外は集めない。
    // 送信直前のbeforeSendでも落とす二重の守りにする（backendのsrc/sentry.tsと同じ方針）
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['User-Agent'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    // 性能計測（トレース）・セッションリプレイは入れない。エラーだけを送る
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
})
