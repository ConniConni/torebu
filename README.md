# torebu（トレ部）

仲間と筋トレを記録・応援しあうアプリ「トレ部」。

詳細は [`CLAUDE.md`](./CLAUDE.md) および [`docs/`](./docs/) 参照。

## セットアップ

### 前提

- Node.js 22系（LTS）。`frontend/`に`.nvmrc`があるので`nvm use`で切り替え可能

### frontend（Nuxt.js）

```bash
cd frontend
nvm use
npm install
npm run dev
```

- `http://localhost:3000` で起動確認
- 型チェック: `npm run typecheck`
- Lint: `npm run lint`
- フォーマット: `npm run format`（整形） / `npm run format:check`（チェックのみ）

### backend（Express）

前提: Docker（ローカルPostgreSQL用）

```bash
cd backend
nvm use
npm install
cp .env.example .env
docker compose up -d   # ローカルPostgreSQLを起動
npm run dev
```

- スキーマ（`prisma/schema.prisma`）にモデルを追加したら `npx prisma migrate dev` でマイグレーションを作成・適用する

- `http://localhost:3001/health` で起動確認
- 型チェック: `npm run typecheck`
- Lint: `npm run lint`
- フォーマット: `npm run format`（整形） / `npm run format:check`（チェックのみ）
- テスト: `npm run test`
- ビルド: `npm run build`（`dist/`に出力） / 起動: `npm run start`
