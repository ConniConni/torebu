import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // テストファイルを並列実行すると、各ファイルが個別に生成するPrismaClient/セッション用pg.Poolや
    // express-sessionの`session`テーブル(createTableIfMissing)への初期化が同じ実DBに対して競合し、
    // ログイン直後のセッションが読めず401になるなどのflakyな失敗につながる(2026-09-12発見、docs/backlog.md参照)。
    // テストDBを共有する構成を続ける前提では、ファイル単位でシリアル実行するのが最も確実な対策
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
