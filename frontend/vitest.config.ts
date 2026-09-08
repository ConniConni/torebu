import { defineConfig } from 'vitest/config'

// 対象は`app/utils/`配下の純粋な計算・変換ロジックのみ（CLAUDE.mdの優先順位に沿い、
// フロントのコンポーネント単体テストは今は見送る。docs/backlog.md参照）。
// Nuxtのauto-import等に依存しないため、@nuxt/test-utilsのNuxt環境は使わずシンプルな設定にする
export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/**/*.spec.ts'],
  },
})
