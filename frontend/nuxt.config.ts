import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  // トップ画面（WelcomeScreen）の見出しに、元画像のマーカー体に寄せたGoogle Fontsを使う（Issue #176）
  app: {
    head: {
      // 全ページ共通のデフォルトタイトル（未設定だとブラウザタブが無題になるため。Issue #204）。
      // 未ログイン時のトップページはpages/index.vue側でuseSeoMetaによりサービス紹介用に上書きする
      title: 'トレ部',
      meta: [
        // Google Search Consoleの所有権確認用（Issue #208）。確認コードはプロパティごとに別の値で、
        // 独自ドメイン（torebu.com）への切り替えに伴い新プロパティ用に差し替えた（旧URLはリダイレクト
        // のみでHTMLを返さないため、旧コードは不要）。消すと所有権が外れることがあるので残す
        { name: 'google-site-verification', content: 'QPps-MKh7_Asa5ZPRVBoD_MNy5Kmbrmcbn3UDjyYP44' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Yusei+Magic&display=swap',
        },
        // favicon・ホーム画面追加用アイコン（Issue #206）
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },
  // フロントとバックエンドを同一サイト（同一オリジン）に揃えるためのプロキシ設定。
  // CSRF対策をSameSite=Laxのみに絞れる前提を保つための構成（docs/schema.mdの
  // 「セキュリティ実装の優先度」参照）。本番も同一登録可能ドメイン配下に両方置く想定
  routeRules: {
    '/api/**': { proxy: `${process.env.BACKEND_ORIGIN ?? 'http://localhost:3001'}/**` },
  },
})
