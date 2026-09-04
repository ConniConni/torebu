# 仕様（現状の正）

> **このファイルには「実装済みで確定している仕様」だけを書く。**
> 「やろうと思っているけどまだ無いもの」は書かない。だからここに書いてあることは、今このリポジトリで
> 実際に動いている。
>
> **初めて読むなら `0 → 1 → 2 → 3` の順に読む。**
> `4`・`5`・`6` は**「書くときに引く章」**なので、通読しなくてよい。必要になったときだけ開く。
>
> | 知りたいこと | 見るファイル |
> |---|---|
> | 今どうなっているか | **このファイル** |
> | 次に何をやるか | [roadmap.md](./roadmap.md) |
> | なぜそう決めたか・将来どうする構想か | [schema.md](./schema.md) |
> | そもそも何のために作るのか | [concept.md](./concept.md) |
> | Git/PRの進め方 | [git-workflow.md](./git-workflow.md) |

---

## 0. 用語（読む章）

このリポジトリを読むために必要な言葉だけを挙げる。
**大事なのは「実物」の列。** 意味が曖昧なまま先に進まず、そのファイルを開いて実物を見る。
どれも短いファイルなので、実際に開いて読める量になっている。

| 語 | どういうものか | 実物（開いて確かめる） |
|---|---|---|
| **エンドポイント** | 「メソッド＋パス」1つ分の、APIの入口。`POST /auth/login` で1つ。このアプリには全部で22個ある | 一覧は §4 |
| **ルート（route）** | エンドポイントの中身を書いた処理。Expressでは `router.post('/login', ...)` の形 | [backend/src/routes/](../backend/src/routes/) の4ファイル |
| **ミドルウェア** | ルート処理に届く**前に必ず通る**関数。門番のようなもの。このアプリには2つしかない | [requireAuth.ts](../backend/src/middleware/requireAuth.ts) は**全13行**。まずこれを読むとよい |
| **セッション / Cookie** | 「今このブラウザは誰か」をサーバー側のDBに持ち、ブラウザには鍵（`connect.sid`）だけを渡す方式。鍵からは中身が読めない | [session.ts](../backend/src/session.ts) |
| **プロキシ** | フロント（:3000）に来た `/api/**` へのリクエストを、バックエンド（:3001）へ中継する仕組み | [nuxt.config.ts](../frontend/nuxt.config.ts) の `routeRules` |
| **SSR** | 画面をブラウザではなく**サーバー側で先に組み立てる**Nuxtの動き。この時は素の `$fetch` にCookieが自動で付かない、という落とし穴がある | [useAuth.ts](../frontend/app/composables/useAuth.ts) の `useRequestFetch` のコメント |
| **composable** | Vue/Nuxtで「状態＋その状態を操作する関数」をまとめて使い回すための関数。名前は必ず `use〜` で始まる | [composables/](../frontend/app/composables/) の6本 |
| **`ref` と `useState` の違い** | どちらも「変化する値」を持つ入れ物。違いは**ページを移動したときに消えるか残るか**。`ref` はそのページ専用なので消える。`useState` はアプリ全体で共有されるので残る。**§3-3 で詳しく扱う（Issue13で作り込んだバグの原因）** | [useWorkoutSession.ts](../frontend/app/composables/useWorkoutSession.ts) |
| **バリデーション / zod** | 送られてきた値が想定通りの形か検査すること。zodはその検査ルールを書くライブラリ。通らなければ `400` を返す | [workouts.ts](../backend/src/routes/workouts.ts) の `weightKgSchema` |
| **採番** | 連番（1セット目・2セット目…）を**誰が決めるか**という話。このアプリではサーバーが決めている | [workouts.ts](../backend/src/routes/workouts.ts) の `nextSetOrder` |
| **ソフトデリート** | 行を実際には消さず「消した印」（`deletedAt`）を付けるだけの削除。後から参照される可能性があるデータに使う | `Workout` モデルの `deletedAt` |
| **認可 / IDOR** | 認可＝「そのデータはあなたのものか」の確認。IDOR＝URLのIDを他人のものに書き換えて他人のデータを覗く攻撃。それを防ぐのが認可 | [workouts.ts](../backend/src/routes/workouts.ts) の `findOwnWorkout` |
| **ORM / Prisma** | SQLを直接書かずにDBを操作する道具。`prisma.workout.findMany()` のように書ける | [schema.prisma](../backend/prisma/schema.prisma) |
| **マイグレーション** | DBの構造を変えた履歴。ファイルとして残るので、他の環境でも同じ構造を再現できる | [prisma/migrations/](../backend/prisma/migrations/) の2件 |
| **結合テスト / Supertest** | 実際にHTTPリクエストを投げてAPIを丸ごと動かして確かめるテスト。Supertestはそのための道具 | [workouts.test.ts](../backend/src/routes/workouts.test.ts) |
| **レート制限** | 同じIPからの試行回数に上限を設けること。パスワードの総当たり攻撃対策 | [auth.ts](../backend/src/routes/auth.ts) の `loginRateLimiter` |
| **ハッシュ化 / bcrypt** | パスワードを**元に戻せない形**に変換して保存すること。bcryptはその代表的なやり方。DBが漏れてもパスワード自体は分からない | [auth.ts](../backend/src/routes/auth.ts) の `bcrypt.hash` |

---

## 1. 全体像（読む章）

**この章が一番重要。** 部品を一覧で眺めても全体像は掴めないので、
**「1本の道を端から端まで辿る」**形で示す。2本だけ辿れば、主要な仕組みはひと通り出てくる。

### 1-1. 何がどこで動いているか

```
   ブラウザ
      │
      │  http://localhost:3000
      ▼
 ┌─────────────────────┐
 │  Nuxt (フロント) :3000       │   画面（pages/）・composable（状態と通信）
 │                              │
 │   /api/** だけプロキシで中継 │ ← 同一サイトに揃えるための仕組み
 └──────────┬──────────┘
            │  http://localhost:3001
            ▼
 ┌─────────────────────┐
 │  Express (バック) :3001      │   ミドルウェア → ルート → 検証 → 認可
 └──────────┬──────────┘
            │  Prisma（ORM）
            ▼
 ┌─────────────────────┐
 │  PostgreSQL                  │   ローカル: Docker ／ 本番: Neon
 └─────────────────────┘
```

**なぜプロキシを挟むのか**：ブラウザから見て、フロントもバックも同じ `localhost:3000` に見えるようにするため。
これによりCookieが「別サイト宛」扱いにならず、CSRF対策を `SameSite=Lax` だけで済ませられる（→ §2 の4番）。

### 1-2. 流れ①「ログインボタンを押してから、ホーム画面が出るまで」

この1本を辿ると、**Cookie・セッション・プロキシ・ミドルウェア・SSR** が全部つながる。

1. `/login` でフォームを送信 → [login.vue](../frontend/app/pages/login.vue) が `useAuth().login()` を呼ぶ
2. `$fetch('/api/auth/login')` が飛ぶ → **プロキシ**が `localhost:3001/auth/login` へ中継する
3. Express側：まず `sessionMiddleware` を通る（Cookieがあればセッションを復元する。今回は初回なのでまだ無い）
4. `authRouter.post('/login')` に到達 → **zod** でメールとパスワードの形を検査
5. `bcrypt.compare` でパスワードを照合する
   - このとき、**ユーザーが存在しなくてもダミーハッシュと比較する**。存在するときと処理時間を揃えて、
     「応答が速い＝そのメールアドレスは未登録」と推測されるのを防ぐため（メールアドレス列挙対策）
6. 照合OK → `req.session.regenerate()` でセッションIDを振り直す（**セッション固定化対策**）→ `req.session.userId = user.id`
7. `connect-pg-simple` がDBの `session` テーブルに1行書く → レスポンスに `Set-Cookie: connect.sid=...` が乗る
8. フロントに戻り `navigateTo('/')` → ページ遷移前に [middleware/auth.ts](../frontend/app/middleware/auth.ts) が走る
9. `auth.ts` が `fetchMe()` → `GET /api/auth/me` を呼ぶ。ここでさっきのCookieが一緒に送られる
   - **SSRのときは素の `$fetch` だとCookieが付かない**ため、`useRequestFetch()` を使っている
10. `requireAuth` を通過して `200` が返る → ログイン済みと判定される
11. [pages/index.vue](../frontend/app/pages/index.vue) が `fetchWorkouts()` → `GET /api/workouts` → カレンダーが描画される

### 1-3. 流れ②「『記録』ボタンを押して、セットが1件保存されるまで」

この1本を辿ると、**バリデーション・認可・採番・画面の再描画** がつながる。

1. [workouts/new.vue](../frontend/app/pages/workouts/new.vue) の `onAddSet` → `useWorkoutSession().addSet()`
2. `POST /api/workouts/:id/sets` が飛ぶ（`:id` は進行中のworkoutのID）
3. **`requireAuth`** が門番として動く。未ログインならここで `401` にして先へ進ませない
4. **zod で検証**。ここで仕様が守られる
   - 重量：正の数・**0.5kg刻み**・999.5kg以下（プレートやダンベルの最小刻み幅に合わせた）
   - 回数：正の整数・999以下
   - 重量を省略したら**自重種目**扱い（`null`）
5. **`findOwnWorkout`（認可）**。自分のworkoutでなければ **`403` ではなく `404`** を返す
   - `403`（権限がない）だと「そのIDのデータは存在する」と教えてしまう。`404` なら存在自体を隠せる
6. `isExerciseVisible`。公式種目か自分のカスタム種目でなければ `400 invalid_exercise`
7. **`nextSetOrder`（採番）**。「同じworkout・同じ種目の中で、既存の最大 `setOrder` + 1」をサーバーが決める
   - クライアントに番号を決めさせると、連続で押したときに同じ番号がぶつかる。だからサーバーが決める
8. `prisma.workoutSet.create` でDBに保存
9. 返ってきたセットを `session.value.sets` に足す → **Vueが変化を検知して画面が自動で描き直される**

---

## 2. あなたが決めたこと（読む章）

[schema.md](./schema.md) の「設計方針メモ」には49項目ある。**多すぎて覚えられないのが正常。**
そのうち **MVPで実際に効いている10個** だけをここに置く。困ったらまずこの10行に戻る。

| # | 決めたこと | なぜ |
|---|---|---|
| 1 | 認証は**セッション方式**（JWTではない） | 退会や権限変更を**すぐ失効させたい**場面が多いため |
| 2 | セッションの実体は `connect-pg-simple` に任せる | 期限切れの掃除まで自前実装するコストが、得られる学習に見合わなかった |
| 3 | DBは**Neon**（ローカルはDocker） | 放置してもプロジェクトが自動停止しないため。断続的に触る個人開発向き |
| 4 | フロントとバックを**同一サイトに揃える**（プロキシ） | CSRF対策を `SameSite=Lax` だけで済ませるため。**別ドメインに分けるとこの前提が壊れる** |
| 5 | ソフトデリートは **`workouts` だけ** | 将来 reactions/comments から参照されるテーブルだけが対象。全部に付けるとクエリが複雑になる |
| 6 | 記録は**種目ごとに都度保存** | ジムでの実際の動き（1種目終わったら次へ）に合わせた。まとめて最後に保存する形にしない |
| 7 | 他人のリソースは **`403` ではなく `404`** | 存在自体を隠すため |
| 8 | `setOrder` は**サーバーが採番** | クライアント指定だと連続追加で番号がぶつかるため |
| 9 | 種目マスタに**削除機能を作らない** | 過去の記録が参照している種目を消すと記録が壊れるため |
| 10 | 記録の入口は**「今日」固定** | 過去日対応は画面設計ごとの見直しが必要になるため、意図的に切り離した |

### 2-1. 決めたが、まだ実装されていないこと

MVP完成後の棚卸しで見つかった、**ドキュメントと実装のズレ**。
「決めたはずなのに入っていない」ものなので、判断がブレる原因になる。次のIssueで `backlog.md` に移す。

| ズレ | 状況 |
|---|---|
| **種目名の重複サジェスト表示** | [schema.md](./schema.md) では「DB制約の代わりにアプリ側のサジェストで対応する」と決定されているが、[exercises-new.vue](../frontend/app/pages/workouts/exercises-new.vue) にも `POST /exercises` にも**実装がない**。表記ゆれを防ぐ手段が今どこにもない状態 |
| **種目の表示順** | docsでは「使用回数 → `default_sort_order` → 名前順」の3段階だが、実装は**2段階**（使用回数 → 名前順）。`default_sort_order` を全件null運用にしたための意図的な省略だが、docs側が更新されていない |
| **パスワードリセット** | `users` に `password_reset_token` / `password_reset_expires_at` カラムはあるが、**APIは未実装** |
| **記録のメモ欄** | `PATCH /workouts/:id` の `memo` はAPI実装済みだが、③記録作成に**入力欄がない**ためフロントから使えない |
