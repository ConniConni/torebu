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
  // フロントとバックエンドを同一サイト（同一オリジン）に揃えるためのプロキシ設定。
  // CSRF対策をSameSite=Laxのみに絞れる前提を保つための構成（docs/schema.mdの
  // 「セキュリティ実装の優先度」参照）。本番も同一登録可能ドメイン配下に両方置く想定
  routeRules: {
    '/api/**': { proxy: `${process.env.BACKEND_ORIGIN ?? 'http://localhost:3001'}/**` },
  },
})
