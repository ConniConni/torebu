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
> | 未対応事項・課題・アイデア | [backlog.md](./backlog.md) |
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
| **composable** | Vue/Nuxtで「状態＋その状態を操作する関数」をまとめて使い回すための関数。名前は必ず `use〜` で始まる | [composables/](../frontend/app/composables/) の7本 |
| **`ref` と `useState` の違い** | どちらも「変化する値」を持つ入れ物。違いは**ページを移動したときに消えるか残るか**。`ref` はそのページ専用なので消える。`useState` はアプリ全体で共有されるので残る。**§3-3 で詳しく扱う（Issue13で作り込み、Issue #36で修正したバグの原因）** | [useWorkoutSession.ts](../frontend/app/composables/useWorkoutSession.ts) |
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

1. [workouts/new.vue](../frontend/app/pages/workouts/new.vue) の「＋セット追加」→ `onAddSet` →
   `useWorkoutSession().addSet()`（デフォルト値・自重10回で即登録。§3-2参照）
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
| 5 | ソフトデリートは **`workouts`・`exercises`（カスタム種目のみ）** | 将来 reactions/comments から参照されるテーブル、および他レコード（`workout_sets`/`routine_exercises`）から参照され続けるテーブルだけが対象。全部に付けるとクエリが複雑になる |
| 6 | 記録は**種目ごとに都度保存**。セット追加も「＋セット追加」を押した瞬間にデフォルト値で即保存し、その場でblur自動保存の編集欄で手直しする方式（[Issue #91](https://github.com/ConniConni/torebu/issues/91)）。デフォルト値は**①今回のworkout内で既にそのセットがあれば直近のセット → ②前回実際に記録した値（`lastSet`） → ③自重・10回**の優先順（[Issue #116](https://github.com/ConniConni/torebu/issues/116)） | ジムでの実際の動き（1種目終わったら次へ）に合わせた。まとめて最後に保存する形にしない。当初は「入力してから『記録』ボタンを押す」方式だったが、⑤・セット編集・メモ保存が自動保存に統一される中で③だけ非対称だったため統一した。デフォルト値は当初固定（自重・10回）だったが、前回の実績が分かっているならその方が手直しが少なく済むため実績優先に変更した |
| 7 | 他人のリソースは **`403` ではなく `404`** | 存在自体を隠すため |
| 8 | `setOrder` は**サーバーが採番** | クライアント指定だと連続追加で番号がぶつかるため |
| 9 | 種目マスタの削除は**カスタム種目（`createdBy`が自分）のみ、ソフトデリート**（[Issue #113](https://github.com/ConniConni/torebu/issues/113)） | 物理削除だと過去の記録が参照している種目が壊れるため。公式種目（`createdBy`がnull）には削除機能自体を作らない方針は維持 |
| 10 | 記録日は**作成後は編集不可**。②ホームの「＋今日の記録を始める」ボタンは**「今日」固定のまま** | 過去日対応は画面設計ごとの見直しが必要になるため、意図的に切り離した。記録日を編集可能にすると、③の「同じ日付のworkoutがあれば再開する」という日付ベースの引き当てと噛み合わず、記録が実質二重になる事故につながる。**③のページ自体はIssue #52で`?date=`クエリに対応済み**（下記③の行・§3-4参照）で、**②の既存記録カード（過去日含む）から③へ日付付きで遷移する導線は実装済み**（⑥廃止・統合ステップ4）。**②のカレンダーで過去日を選んで記録が0件のときに③を開始する導線もIssue #61で実装済み**（未来日は③側で今日にクランプされ紛らわしいため対象外） |

### 2-1. 決めたが、まだ実装されていないこと

MVP完成後の棚卸しで見つかった、**ドキュメントと実装のズレ**。
「決めたはずなのに入っていない」ものなので、判断がブレる原因になる。一覧は
[backlog.md](./backlog.md) の「ドキュメントと実装のズレ」を見る。

---

## 3. 画面と、画面をまたぐ状態の持ち方（読む章）

### 3-1. 画面一覧（実装済み15ページ）

丸数字は [concept.md](./concept.md) で使っている画面番号。**⑥記録詳細は③記録作成に統合されて廃止した**
（③⑥統合ステップ4。②の記録カードのリンク先も⑥→③に切り替え済み。経緯は
[roadmap.md](./roadmap.md)「③記録作成・⑥記録詳細の統合」参照）。

| パス | 画面 | 役割 | 主に使うAPI | ミドルウェア |
|---|---|---|---|---|
| `/login` | ① | ログイン | `POST /auth/login` | `guest` |
| `/register` | ① | 新規登録 | `POST /auth/register` → 続けて `POST /auth/login` | `guest` |
| `/`（未ログイン） | - | トップ画面。イラストを画面いっぱいに表示し、下部に①ログイン・新規登録への導線を置く（Issue #151） | - | なし（ページ内で分岐、下記参照） |
| `/`（ログイン中） | ② | ホーム（カレンダー・記録日数・今週のサマリー・記録カードの本体削除・通知バッジ） | `GET /workouts`, `GET /workouts/:id`, `DELETE /workouts/:id`, `GET /stats/volume`, `GET /notifications/unread-count`, `POST /auth/logout` | なし（ページ内で分岐、下記参照） |
| `/workouts/new`<br>（`?date=YYYY-MM-DD`任意） | ③ | 記録作成・記録の見返し（本体画面。今日の新規記録も過去日の記録の見返し・編集も1画面で担う。記録本体の削除は②へ移設済み、下記参照） | `POST /workouts`, `PATCH /workouts/:id`, `POST /workouts/:id/sets`, `PATCH/DELETE /workouts/:id/sets/:setId`, `GET /exercises`, `GET /routines`, `GET /routines/:id` | `auth` |
| `/workouts/exercises` | ④ | 種目選択。各行の「ⓘ」ボタンで部位ハイライトの全画面シートを開ける（Phase2、下記参照） | `GET /exercises` | `auth` |
| `/workouts/exercises-new` | ⑦ | 種目追加 | `POST /exercises` | `auth` |
| `/routines` | ⑤ | ルーティン一覧 | `GET /routines`, `POST /routines`, `DELETE /routines/:id` | `auth` |
| `/routines/[id]` | ⑤ | ルーティン編集 | `GET/PATCH/DELETE /routines/:id`, `POST/PATCH/DELETE /routines/:id/exercises` | `auth` |
| `/stats` | ⑧ | 統計（合計負荷重量の推移・種目別推移をグラフ表示、Phase3-C） | `GET /stats/volume`, `GET /stats/exercises/:id/history`, `GET /exercises` | `auth` |
| `/groups` | - | グループ一覧（Phase4）。所属グループの一覧・新規作成・招待コードで参加する画面への導線 | `GET /groups`, `POST /groups` | `auth` |
| `/groups/join` | - | 招待コードで参加（Phase4） | `POST /groups/join` | `auth` |
| `/groups/[id]` | - | グループ詳細（Phase4）。メンバー一覧・招待コード表示/再発行〈オーナー限定〉・退会・削除〈オーナー限定〉 | `GET /groups/:id`, `POST /groups/:id/invite`, `POST /groups/:id/leave`, `DELETE /groups/:id` | `auth` |
| `/groups/[id]/workouts` | - | グループの記録フィード（Phase4）。所属メンバー全員（本人含む）の記録を新しい順に表示する。各記録にいいねボタン・コメント（アコーディオン展開、一覧・投稿・自分の削除）を表示する | `GET /groups/:id/workouts`, `POST/DELETE /workouts/:id/reactions`, `GET/POST /workouts/:id/comments`, `DELETE /workouts/:id/comments/:commentId` | `auth` |
| `/notifications` | - | 通知一覧（Phase4）。自分の記録への「いいね」「コメント」の通知を新しい順に表示する。開いた時点で全件既読になる | `GET /notifications`, `POST /notifications/read` | `auth` |
| `/groups/[id]/ranking` | - | グループ内ランキング（Phase4）。合計挙上重量で週間/月間/通算の3タブを切り替えて表示する | `GET /groups/:id/ranking` | `auth` |

**ミドルウェアの意味**
- `auth`（[auth.ts](../frontend/app/middleware/auth.ts)）：未ログインなら `/login` へ飛ばす（`/`自体は対象外。下記参照）
- `guest`（[guest.ts](../frontend/app/middleware/guest.ts)）：ログイン済みなら `/` へ飛ばす

**「/」の出し分け・トップ画面のイラスト（Issue #151）の実装メモ**
- 当初は①ログイン画面にイラストを追加する想定だったが、検討の結果「イラストを画面いっぱいに見せる
  専用のトップ画面を新設し、下部にログイン・新規登録への導線を置く」構成に変更した
- [index.vue](../frontend/app/pages/index.vue)（`/`）に`auth`ミドルウェアは付けず、`useAuth().fetchMe()`で
  ログイン状態を取得したうえで`<HomeScreen v-if="user" /><WelcomeScreen v-else />`と自前で分岐する。
  以前は未ログインで`/`にアクセスすると`auth`ミドルウェアで`/login`へ強制リダイレクトしていたが、
  未ログインでも`/`自体にトップ画面を表示したいため、リダイレクトはやめてこの分岐に置き換えた
- ②ホーム画面の中身（旧`index.vue`の全体）は[HomeScreen.vue](../frontend/app/components/HomeScreen.vue)に
  切り出した。`v-if`で条件付きマウントすることで、未ログイン時は中の`fetchWorkouts()`等のAPI呼び出しが
  一切走らない（コンポーネントの`setup`自体が実行されないため）
- トップ画面は[WelcomeScreen.vue](../frontend/app/components/WelcomeScreen.vue)。静的なイラスト
  （`frontend/app/assets/images/top_image.png`）を画面いっぱいに`object-cover`で敷き、「ログイン」
  「新規登録」ボタンはイラスト下部の無地オレンジの余白部分に重ねて配置する（ボタンをイラストの下に
  別領域として置く案・縦積み案も検討したが、イラストを画面いっぱいに見せたいという要望に沿って
  オーバーレイ方式にした）。余白部分の位置はPythonでピクセル解析し、画像下端から約10%
  （y座標90%〜100%）が無地であることを確認したうえでボタンの絶対配置位置を決めた。
  `app/assets/`配下に置きコンポーネント側で`import`する形にした（`public/`は未加工でそのまま配信される
  ため、ビルド時にViteが最適化する`assets/`側を採用。既存の`assets/css`/`assets/data`と揃える）
- `object-position`はデフォルトの中央基準ではなく`object-bottom`（画像下端基準）にした。中央基準だと
  画面の縦横比が変わるたびに「イラストのどの部分を映すか」がずれ、下部のオレンジの余白（ボタンが
  重なる位置）とのバランスが画面サイズによって崩れてしまうという指摘（2026-09-09）を受けての対応。
  下端基準にすることで、`object-cover`が横方向・縦方向どちらを基準にスケールする画面比率でも、
  常に画像の下端＝オレンジの余白が画面下端に揃う
- **既知の制約**：イラストは縦横比2:3、スマホ画面はより縦長（概ね0.42〜0.52）のため、
  `object-cover`で画面いっぱいに敷くと左右の一部が見切れる（テキスト・吹き出しの端）。
  PNGに余白を追加しても`object-cover`は中央基準で切り抜くため効果が無いことを確認済み。
  抜本的な解消にはスマホ画面に近い縦横比の新しいイラストが必要なため、新しいイラストが
  用意できるまでは見切れを許容する（2026-09-09ユーザー判断。詳細は`docs/backlog.md`
  「判断保留」節参照）
- スマホ幅（320〜430px程度）で崩れないことを確認した。PC向けの専用レイアウト（横並び等）は
  今回のスコープ外（`docs/backlog.md`「判断保留」節参照）

**記録日数（今月・通算、Phase3-B）の実装メモ**
- ②ホーム画面の「＋今日の記録をつける」ボタン・「ルーティン一覧」リンクとカレンダーの間に、
  薄い青のサマリー帯として常時表示。「今月N日」「通算N日」を帯の中で均等配置（`justify-around`）
  し、数字部分だけ一回り大きく太字にしている（縦2段で数字を並べる案は左右のバランスが取りづらく、
  横並びにしても中央にまとめると余白の付き方が単調だったため、帯全体に均等配置し数字を強調する形に
  変更した。実装の見た目は複数パターンを比較して決めた。比較に使った企画メモ（Artifact）参照）
- 計算ロジックは[trainingDays.ts](../frontend/app/utils/trainingDays.ts)の
  `countTrainingDaysInMonth()`（今月分）・`countTotalTrainingDays()`（通算分）。バックエンドAPIは
  追加していない（`GET /workouts`で既に取得済みの`performedAt`一覧から計算できるため）
- 「記録がある日」は`hasSets`を問わない（メモのみの日も対象。`workouts.performed_at`の存在だけで
  判定できる軽量な機能、という`docs/roadmap.md`の前提に合わせた）
- 当初は連続記録日数（ストリーク）を名前欄の隣にテキストで表示する案で実装したが、「1年後にその
  数字が良いのか悪いのか意味を持ちづらい」という指摘を受け、期間の区切りが分かりやすい「今月」＋
  積み上げが伝わる「通算」の組み合わせに変更した。さらに表示の見た目（配置・華やかさ）を6パターン
  のモックで比較し、CTAとカレンダーの間に帯として置く案を採用した（2026-09-08）

**今週のサマリー（Phase3-D）の実装メモ**
- ②ホーム画面の「今月/通算」記録日数帯の直下に、白背景のカード2枚を横並びで表示する。
  左カードは「今週の合計負荷重量」「今週のトレ日数」を縦積みで表示（横並びだと数字の桁数差で
  間延びして見えたため縦積みに変更）。右カードは「週別推移」として直近4週間の合計負荷重量を
  横棒グラフで表示する（今週の行を一番上、値ラベルは出さずバーの長さのみで比較させる形。
  複数パターンをモックで比較して決定、2026-09-08）
- 前週比較（増減%表示）は分析寄りになりすぎる・実装コストが見合わないと判断し見送った
- 新規バックエンドAPIは作らず、既存`GET /stats/volume`（`range=1m`）のレスポンスをフロントで
  週集計して使う。トレ日数はPhase3-Bと同じ`allRecordedDates`（`GET /workouts`の`performedAt`
  一覧）を流用する。Phase3-Bと同じく「フロント集計のみで完結させる」方針を踏襲した
- 週の定義は日曜始まり〜土曜（[HomeCalendar.vue](../frontend/app/components/HomeCalendar.vue)の
  曜日表示と揃える）。集計ロジックは[weeklySummary.ts](../frontend/app/utils/weeklySummary.ts)の
  `weekStartDate()`/`weekEndDate()`/`sumWeeklyVolume()`/`countWeeklyTrainingDays()`/
  `weeklyVolumeTrend()`（Vitestでテスト済み）。`weeklyVolumeTrend()`はデータが無い週も0kgとして
  返す（0埋めしない`/stats/volume`本体とは異なり、4週分を常に揃えて描画するため）
- `GET /stats/volume`の取得に失敗しても他の表示（カレンダー等）は妨げないよう、このカード内だけで
  独立してエラー表示する

**統計画面（⑧、Phase3-C）の実装メモ**
- 構成：合計負荷重量の推移（全種目合算・日別・折れ線）＋種目別推移（種目セレクト＋最大重量・
  合計負荷重量の推移、折れ線2本）。期間（`1m`/`3m`/`all`）の切り替えは画面上部のタブで両グラフに
  共通適用する
- 種目セレクトの選択肢は集計対象（`GET /stats/exercises/:id/history`）と同じ公式種目のみに絞る
  （カスタム種目・削除済み種目は候補から除外。渡すと404になるため）
- グラフ描画は Chart.js + vue-chartjs（新規依存）。SSR時はcanvasを描画できないため`<ClientOnly>`
  で囲む
- APIレスポンス（`{date, ...}[]`）→Chart.jsのdataset形式への変換は
  [statsChart.ts](../frontend/app/utils/statsChart.ts)に切り出し、Vitestでテストしている
  （フロントのテスト基盤導入もこのタイミングで行った。docs/backlog.mdの保留事項参照）。
  rangeや選択種目が変わるたびに取り直す一覧のため、`useStats`（コンポーザブル）では
  `exercises`/`workouts`のようなセッション中キャッシュ（`useState`）は行っていない
- ホーム画面（②）から「統計」ボタンでSPA遷移する

**部位ハイライト（Phase2、[muscle-highlight.md](./muscle-highlight.md)参照）の実装メモ**
- コンポーネント：[MuscleHighlightSheet.vue](../frontend/app/components/MuscleHighlightSheet.vue)
  （全画面シート本体、前面/背面トグル・「関連筋も見る」トグル）
  ＋ [MuscleBodyDiagram.vue](../frontend/app/components/MuscleBodyDiagram.vue)（片面のSVG描画）
- ロジック：[muscleHighlightSvg.ts](../frontend/app/utils/muscleHighlightSvg.ts)（発光・ゾーン塗り分け・ラベル配置。
  プロトタイプ由来のライトテーマ用パラメータのみ移植）、[muscleSlugs.ts](../frontend/app/utils/muscleSlugs.ts)
  （`mainMuscle`/`relatedMuscles`の日本語文字列 → SVGスラッグ・ゾーンの対応表）
- SVG座標データ：[muscle-body-svg.json](../frontend/app/assets/data/muscle-body-svg.json)
  （react-native-body-highlighter由来・MIT。ライセンス全文は同ディレクトリの`.LICENSE.md`）。男性図のみ
- `mainMuscle`が無い種目（カスタム種目、および対応表に無い想定外の値）はシートに
  「部位ハイライトのデータがありません」と表示する。光る部位が無い面を選んだ場合は図と
  「この面に光る部位はありません」を表示する（選択肢は隠さない）
- 「関連筋も見る」トグルは初期状態オフ（主働筋のみ表示）。関連筋が無い種目ではボタン自体を出さない
- 女性図・ダーク/ライトテーマ切替はプロトタイプには存在するがtorebuでは未実装（理由はdocs/backlog.md参照）

**グループ機能（Phase4初弾、グループ基盤）の実装メモ**
- スコープはグループの作成・招待コード発行/再発行・招待コードでの参加・メンバー一覧・退会・
  削除〈オーナー限定〉まで。いいね・コメント・通知・ランキング・「イチオシこだわり共有」は
  別Issueで後続実装する（docs/schema.mdの「Phase4の検討結果」参照）
- ②ホーム画面の「ルーティン」「統計」の並びに「グループ」を追加し3分割にした
  （タブバー化はdocs/backlog.mdの判断保留の通りまだ見送り）
- 招待コードは`GET /groups/:id`のレスポンスに含め、**所属メンバー全員が閲覧できる**
  （表示は誰でもよいが、再発行のみオーナー限定という区別。docs/schema.mdのPhase4 API一覧の
  書き方に合わせた）。有効期限は`POST /groups/:id/invite`（発行/再発行）のたびに
  現在時刻+30日で更新する（`INVITE_CODE_EXPIRY_DAYS`、[groups.ts](../backend/src/routes/groups.ts)）。
  期限は`member_limit`による人数制限を補う保険という位置づけで、具体的な日数はdocs/schema.mdに
  明記が無かったため実装時に決定した
- 退会・グループ削除のボタンはルーティン一覧の削除確認と同じ「ボタン→画面内2段階確認」の
  パターンに揃えた
- 唯一のオーナーが退会しようとすると`400 sole_owner_cannot_leave`。エラーメッセージで
  「先に他のメンバーをオーナーにするか、グループを削除してください」と案内するが、
  他メンバーをオーナーに任命するUIはこのIssueのスコープ外（次のIssue以降）
- グループ一覧・詳細は`useGroups`（[useGroups.ts](../frontend/app/composables/useGroups.ts)）で
  取得。`groups`一覧は`useState`でセッション中キャッシュし、ログアウト時に`useAuth.ts`の
  `resetUserState()`でリセットする（他のuseState一覧と同じ理由。Issue #111参照）
- **バグ修正（2026-09-08、Issue #138の作業中に発覚）**：`fetchGroupDetail`/`fetchGroupWorkouts`が
  素の`$fetch`を使っていたため、SSR時にブラウザのCookieが転送されず`401`になり、SSRは
  「グループの取得に失敗しました」のエラー表示を返す一方、ハイドレーション後のクライアント側
  再取得は成功して正常な内容に描き変わる、という**ハイドレーションミスマッチ**を起こしていた
  （コンソールに`Hydration node mismatch`と`401`が出る。グループ詳細・記録フィード双方の画面遷移で
  再現）。`fetchGroups`が既にしていた通り`useRequestFetch()`に統一して解消した。
  グロッサリー（§1「SSR」）に載っている既知の落とし穴だが、新しいAPI呼び出しを追加するたびに
  同じミスが起きうるため、`useGroups.ts`にコメントを追記した

**グループの記録フィード（Phase4、[Issue #138](https://github.com/ConniConni/torebu/issues/138)）の実装メモ**
- いいね・コメント機能の対象となる「仲間の記録を見る画面」が無いことに気づき、グループ基盤の次に
  先行して実装した。グループ詳細画面（`/groups/[id]`）の「みんなの記録を見る」から遷移する
  `/groups/[id]/workouts`画面
- バックエンドは`GET /groups/:id/workouts`を追加。そのグループのアクティブなメンバー全員
  （本人含む）の記録（ソフトデリート除く）を`performedAt`降順で返す。各要素に種目ごとの
  セット一覧（`exercises`：`exerciseId`/`name`/`sets`）を含める
- **カードの見せ方**は企画メモ（Artifact）で複数案を比較した上で決定した：
  - まずカード全体の構成は「SNSタイムライン型」（アバター＋名前＋日付のヘッダー、種目はチップ表示、
    下部にいいね・コメント欄の置き場を確保）を採用。「日にちごとに時系列で並べる」「種目ごとに
    横断して並べる」の他候補は、次のIssue（いいね・コメント）の対象が`workout`単位という
    既存設計（schema.mdの`reactions`/`comments`）に噛み合わないため見送った
    （メンバー別カレンダー表示・種目横断表示は`docs/backlog.md`の判断保留に記録済み）
  - 種目チップの先（重量・回数の中身）は**アコーディオン展開**にした：初期状態は種目名＋セット数の
    チップのみで、タップした種目だけその場でセット表（②ホームの記録カードと同じグリッド表形式、
    [index.vue](../frontend/app/pages/index.vue)参照）を展開する。他の代替案
    （常時全展開・先頭数セットのみ表示・メイン種目だけ全展開）は「複数人分を並べたときにカードの
    縦幅が人によってバラつく」問題を抱えており、アコーディオンは畳んだ状態でカードの高さが揃う点を
    決め手に選んだ（2026-09-08、企画メモで比較）
  - 開閉状態は`${workoutId}:${exerciseId}`をキーにしたSetで管理し、種目ごとに独立して開閉できる
    （[workouts.vue](../frontend/app/pages/groups/[id]/workouts.vue)参照）
- ページ実装は`pages/groups/[id].vue`を`pages/groups/[id]/index.vue`に移動した上で
  `pages/groups/[id]/workouts.vue`を追加する形にした。**同名の`[id].vue`と`[id]/`ディレクトリを
  併存させると、Nuxtが`/groups/:id/workouts`のようなネストしたパスを`[id].vue`側にルーティングして
  しまい、URLだけ変わって画面が遷移しない不具合になる**（実装中に発覚。SPA遷移で気づいた。
  `docs/CLAUDE.md`のブラウザ確認方針どおり実際のクリック遷移で検証したことで発見できた）

**グループの記録フィードへのいいね（Phase4、[Issue #140](https://github.com/ConniConni/torebu/issues/140)）の実装メモ**
- 記録フィード画面ができたことで、いいねの対象となる「仲間の記録を見る画面」が揃ったため、
  グループ基盤・記録フィードに続く交流機能として着手した。対象は`workout`のみ
  （`workout_set`・`topic_post`は対象UIが無いためスコープ外。`docs/schema.md`の`reactions`
  テーブル定義参照）
- **エンドポイントは`groups`ではなく`workouts`側に置く**：いいねの対象はworkout単体であり、
  グループへの所属は認可判定に使うだけのため。`POST/DELETE /workouts/:id/reactions`
  （[workouts.ts](../backend/src/routes/workouts.ts)）
- **認可はグループの記録フィードで見える範囲と一致させる**：自分の記録、または
  いずれかのアクティブなグループで同席しているメンバーの記録にのみいいねできる
  （`shareActiveGroup`関数）。対象外・削除済み・存在しない場合は`404`（IDOR対策）
- **冪等に設計**：`POST`は`upsert`、`DELETE`は`deleteMany`を使い、二重いいね・未いいね状態での
  取り消しのどちらもエラーにせず現在の状態（`reactionCount`/`reactedByMe`）を返す
- `GET /groups/:id/workouts`のレスポンス各要素に`reactionCount`（いいね数）・`reactedByMe`
  （自分がいいね済みか）を追加。N+1を避けるため`groupBy`と`findMany`をそれぞれ1回ずつ発行して
  まとめて引く
- フロントはハート型のトグルボタンをカード下部に追加（[HeartIcon.vue](../frontend/app/components/HeartIcon.vue)、
  outline/solidの2種をTrashIcon.vue等と同じ方針でHeroiconsから静的コピー）。連打による二重
  リクエストを防ぐため、通信中のworkoutIdを持つSetでボタンを無効化する

**グループの記録フィードへのコメント（Phase4、[Issue #142](https://github.com/ConniConni/torebu/issues/142)）の実装メモ**
- いいねと同じ`workout`単位・同じ認可ロジックを再利用できるため、いいねの次に着手した。対象は
  `workout`のみ（`topic_post`は対象UIが無いためスコープ外。`docs/schema.md`の`comments`テーブル
  定義参照）
- エンドポイントもいいねと同様`workouts`側に置く：`GET/POST /workouts/:id/comments`、
  `DELETE /workouts/:id/comments/:commentId`（[workouts.ts](../backend/src/routes/workouts.ts)）。
  認可は`findAccessibleWorkout`/`shareActiveGroup`をそのまま再利用（自分の記録、または
  いずれかのアクティブなグループで同席しているメンバーの記録のみ。`404`でIDOR対策）
- **削除は自分のコメントのみ可能**（グループオーナーによる削除は今回のスコープ外。
  他人のコメントを指定した場合も`404`）
- コメント本文は`workouts.memo`と同じ上限（1〜500文字）。`reactions`と異なり1人が複数回
  投稿できるため`UNIQUE`制約は無く、`createdAt`昇順（古い順）で返す
- **UIはフィードカード内のアコーディオン展開**：種目チップの展開UIと同じ考え方で、別画面には
  遷移しない。「いいね」ボタンの隣に件数バッジ付きの「コメント」ボタンを置き、タップで
  カード内にコメント一覧＋入力欄を展開する。`GET /groups/:id/workouts`のレスポンスには
  `commentCount`（件数、いいねの`reactionCount`と同じ形で`groupBy`により1クエリで取得）のみを
  含め、コメント本文自体は展開時に`GET /workouts/:id/comments`で遅延取得する（記録フィード
  自体のペイロードを重くしないため）
- **入力欄のEnter送信はIME変換確定と区別する**：`@keydown.enter`ハンドラ（`onCommentEnter`）で
  `event.isComposing`を見て、変換中のEnterでは送信せず、変換確定後に改めて押したEnterでのみ送信する
  （2026-09-09、レビュー指摘で修正。PC入力で変換確定のEnterがそのまま誤送信されていた）
- 自分のコメントのみ、Issue #93で確立した「即削除・確認なし系」の丸バッジ×ゴミ箱アイコン
  （[TrashIcon.vue](../frontend/app/components/TrashIcon.vue)）を表示する。確認ダイアログは
  挟まない
- 吹き出しアイコンは[CommentIcon.vue](../frontend/app/components/CommentIcon.vue)を新規追加
  （HeartIcon.vue・TrashIcon.vue等と同じ方針でHeroiconsのSVGパスを静的コピー）

**通知（Phase4、[Issue #144](https://github.com/ConniConni/torebu/issues/144)）の実装メモ**
- いいね・コメントに反応する側の体験は揃ったが、反応された側（記録の投稿者）に知らせる手段が
  無かったため着手。事前にUIモックで合意した上で実装した
- **通知を作るAPIは無い**：`POST /workouts/:id/reactions`・`POST /workouts/:id/comments`
  （[workouts.ts](../backend/src/routes/workouts.ts)）の内部で`notifyWorkoutOwner`関数を呼び、
  副作用として`notifications`を作る。対象は常に**自分の記録**（通知の宛先＝記録の投稿者）
- **自分の記録への自分の操作では作らない**（`recipientId === actorId`ならスキップ）
- いいねは`upsert`で冪等だが、**通知は新規いいね時のみ**作る（2回目以降の押下で複製しないよう、
  `upsert`実行前に既存いいねの有無を確認している）。いいね取り消し（`DELETE`）時に通知を削除する
  仕組みは無い（作成済みの通知はそのまま残る）
- **配信方式はポーリング無し**：`docs/schema.md`「Phase4の検討結果」の決定通り、画面遷移・
  読み込み時にAPIを叩くだけ。②ホームは`GET /notifications/unread-count`のみを呼びバッジ表示、
  通知一覧（`/notifications`）を開いたときだけ`GET /notifications`で本体を取得する
- **既読化は開いた時点で自動的に一括**（`POST /notifications/read`）。個別の既読トグルは設けない。
  フロントは**一覧取得→既読化の順で呼ぶ**ことで、開いた瞬間の未読/既読の見た目（背景色・ドット）を
  取得時点のスナップショットで出せるようにしている（先に既読化すると全件既読の見た目になり、
  どれが新着だったか分からなくなるため）
- **通知一覧の各項目のリンク先はグループの記録フィード（`/groups/:groupId/workouts?workout=:workoutId`）
  を優先する**（実装当初は自分の記録画面`/workouts/new`にリンクしていたが、いいね・コメントは
  自分の記録画面には表示されずグループの記録フィードでしか見えないため、レビュー指摘を受けて
  変更した。2026-09-09）。`GET /notifications`のレスポンスに、通知した相手（actor）と自分が
  **現在も同席しているアクティブなグループ**を1つ引いた`target.groupId`を含める
  （`findSharedGroupIds`関数。判定基準は`shareActiveGroup`と同じ）。actorが既に共通のグループを
  全て退会している等で`groupId`が`null`の場合のみ、自分の記録画面（`/workouts/new?date=...`）に
  フォールバックする
  - グループの記録フィード側（`groups/[id]/workouts.vue`）は`?workout=`クエリを見て、対象カードまで
    自動スクロール・コメント欄を自動展開・一時的な枠線ハイライトを行う
- ベルアイコンは[BellIcon.vue](../frontend/app/components/BellIcon.vue)を新規追加
  （HeartIcon.vue・CommentIcon.vue等と同じ方針でHeroiconsのSVGパスを静的コピー）

**グループ内ランキング（Phase4、[Issue #147](https://github.com/ConniConni/torebu/issues/147)）の実装メモ**
- グループ基盤・記録フィード・いいね・コメント・通知に続くPhase4の残タスクのうち、ランキングを
  先に着手した（`docs/roadmap.md`参照。残る「イチオシこだわり共有」は次のIssue）
- 指標は`docs/schema.md`「Phase4の検討結果」で決めた通り**合計挙上重量1本**のみ。期間は
  週間（日曜起算）／月間（1日起算）／通算の3タブで、`GET /groups/:id/ranking?period=week|month|all`
  を新設した（デフォルトは`week`）
- **集計は個人の集計（Phase3-C `stats.ts`）と条件を1つだけ変えて再利用**：公式種目のみが対象な点は
  共通だが、`stats.ts`は自重セット（`weightKg`が`null`）を集計から完全に除外するのに対し、
  ランキングは**0kg扱いで加算する**（合計は変わらないが、`totalVolumeKg: 0`のメンバーも
  「記録はしている」ことが分かるようにするため）
- 週・月の起算日はPhase3-D（週間サマリー）の週定義（日曜〜土曜）と統一し、月は1日起算。
  ただし過去の期間（先週・先月等）を遡る機能は無く、常に「現在の期間の開始日時以降」のみを見る
- **記録が無いメンバーも一覧に含める**：グループの全アクティブメンバーを先に0kgで初期化してから
  集計結果を足し込む（`GET /groups/:id/workouts`が投稿がある記録しか返さないのと違い、
  ランキングは「メンバー全員の順位」を見せる画面のため）
- **同着の順位は「同順位、次は人数分スキップ」方式**（1,2,2,4）。オリンピックの表彰台と同じ
  考え方で、単純な人数連番（1,2,2,3）は同着なのに次点だけ優遇されて見えるため採用しなかった
- フロントは`/groups/[id]/ranking`。上位3人を表彰台形式（1位を中央・大きめメダル）で強調し、
  その下に全メンバーの順位一覧を表示する。自分の行は背景色でハイライトする（事前にモックで
  合意した構成。承認待ちのままモックを流用せず、実装前にユーザーへ画面案を提示して承認を得てから
  着手した）
- **1〜3位は金・銀・銅で色分け**（ブランドのオレンジとは別軸の配色。表彰台のメダル・土台の棒・
  一覧の順位バッジすべてに同じ配色を使う）。事前のモック確認で銅色が読みにくいという指摘を受け、
  背景色を暗めの銅色から明るいテラコッタ寄りの色に変更し、文字とのコントラスト比7:1超を確保した
  （金・銀は元の配色のままコントラスト比5:1超）。配色は
  [ranking.vue](../frontend/app/pages/groups/[id]/ranking.vue)の`MEDAL_COLORS`に集約している
- **表彰台の土台（棒グラフ）は実績（合計挙上重量）を1位比の相対的な高さで表示する**。ランクの
  見た目上の並び（2-1-3）ではなく、実測値を1位の値で割った比率から都度高さを計算するため、
  数値の差がそのまま棒の高さの差として伝わる（全員0kgのときは全員同じ最小の高さになる）
- グループ詳細画面（`/groups/[id]`）の「みんなの記録を見る」の下に「ランキングを見る」ボタンを追加

**通知の宛先拡大・いいねユーザー表示（Phase4改善、[Issue #149](https://github.com/ConniConni/torebu/issues/149)）の実装メモ**
- Phase4の通知・いいね（#144, #140）実装後の棚卸しで見つかった2つの積み残し（`docs/backlog.md`参照）
- **コメント通知の宛先を拡大**：あるworkoutにA→B→Aとコメントが連なった場合、Aの2回目のコメントで
  「記録の投稿者」だけでなく「そのworkoutへの過去のコメント投稿者（スレッド参加者）」にも通知が
  届くようにした（[workouts.ts](../backend/src/routes/workouts.ts)の`notifyCommentParticipants`関数）
  - 記録の投稿者への通知は既存どおり`type: comment`のまま。スレッド参加者への通知は新設した
    `type: comment_reply`で区別する（`docs/schema.md`で「reply等を追加するか検討する」としていた
    論点への回答。投稿者向けと文言を変える必要があるため、既存の`comment`を流用せず別typeにした）
  - 宛先は「過去のコメント投稿者（`distinct: ['userId']`）」から、今回のコメント投稿者（自分自身）と
    記録の投稿者（`comment`で通知済み）を除いた集合。重複通知は発生しない
  - `notifications.type`のenumに`comment_reply`を追加（マイグレーション`add_comment_reply_notification_type`）
- **いいねユーザーの表示**：`GET /groups/:id/workouts`のレスポンス各要素に`reactorNames`
  （いいねした人の表示名の配列、いいねした順）を追加した
  - 実装のついでに、従来`reactionCount`用に発行していた`groupBy`クエリを廃止し、`reactorNames`と
    同じ`findMany`（displayName込み）から件数・自分のいいね有無も導出する形に整理した
    （クエリ数は変わらない）
  - 当初は全ての記録でいいねボタンの下に常時テキスト表示する案で実装したが、レビューで
    「自分の記録のいいねボタンを押すといいねしてくれた人が見える」という案が出て設計変更した
    （下記「自分の記録へのいいね禁止」参照）。最終的に`reactorNames`は**自分の記録でのみ画面に
    表示**し、他人の記録では取得はするが使わない（他人の記録のいいねボタンはこれまで通り
    トグルのみで、誰がいいねしたかは見せない。フロントでの絞り込みのみで、APIレスポンス自体は
    全記録共通のまま）
- **自分の記録へのいいね禁止**：`POST /workouts/:id/reactions`は、対象が自分の記録の場合
  `400 { error: 'cannot_react_to_own_workout' }`を返すようにした（`workout.userId === userId`の
  チェックを`findAccessibleWorkout`の後に追加）
  - **理由**：いいねボタン1つに「トグルする（いいねする/取り消す）」と「いいねした人の一覧を開く」
    という2つの役割を持たせると、自分の記録の場合に動きが重なって曖昧になる。自分の記録への
    いいね自体を禁止することでトグル操作が存在しなくなり、「押す＝一覧を開く」に一意に決まる
  - フロント（グループの記録フィード）は、自分の記録かどうか（`workout.userId === 自分のuserId`）
    でいいねボタンの見た目・挙動を出し分ける：
    - **自分の記録**：ハートは常にカウント数表示（0件でも数字のまま、「いいね」という誘導文言は
      出さない）。タップで`reactorNames`を縦一覧で表示するパネルを開閉する（0件なら
      「まだいいねがありません」と表示）。`aria-pressed`は使わずアコーディオンと同じ`aria-expanded`
      にする
    - **他人の記録**：これまで通りトグル（`reactedByMe`で色・塗りを切り替え、0件時は「いいね」の
      誘導文言）。一覧は表示しない
  - `DELETE /workouts/:id/reactions`は自分の記録に対しても引き続き200を返す（元々いいねできない
    ため実質何もしないが、他のエンドポイントと同じ冪等設計に揃えて特別扱いしない）

### 3-2. 記録するときの流れ（実装どおり）

```
② ホーム（/）
 │
 ├─「＋今日の記録を始める」──────────> ③ 記録作成（/workouts/new）
 │   ※ 常に「今日」固定                              │
 │                                                    │
 ├─ 記録カード（過去日含む）を選ぶ ───> ③（/workouts/new?date=その日）
 │   ※ 記録の見返し・編集はここで行う                 │
 │      （⑥記録詳細は廃止し③に統合済み）             │
 │   ※ 各カードの🗑️ボタン→画面内2段階確認で           │
 │      記録本体を削除できる（`DELETE /workouts/:id`。 │
 │      Issue #127で③から②へ移設。⑤ルーティン一覧の  │
 │      本体削除と同じ見た目・方式）                   │
 │                                                    │
 ├─ カレンダーで今日・過去日を選び、その日の記録が0件 ─>│
 │   「＋この日の記録を始める」                      ③（/workouts/new?date=その日）
 │   ※ 未来日を選んだ場合は導線を出さない             │
 │      （③側で未来日は今日にクランプされるため）    │
 │      （以前は過去日のみ表示だったが、今日を選んだ  │
 │      場合だけ導線が無いのは不自然なため、Issue #99  │
 │      で今日も対象に含めた）                        │
 │                                                    │
 └─「ルーティン」─────> ⑤ 一覧（/routines）          │
                            │  ※ 各行の🗑️ボタン→画面内2段階確認で
                            │     ルーティン本体を削除できる（`DELETE /routines/:id`）
                            │                          │
                            └─> ⑤ 編集（/routines/[id]）
                                  ルーティン名入力欄からフォーカスが外れる（blur）たびに
                                  自動保存される（`PATCH /routines/:id`）。明示的な「保存」
                                  ボタンは無い（種目の追加/削除/並び替えも元から即時保存）。
                                  ④で種目を選ぶと、目安セット1件（自重・10回）が即登録された
                                  状態で追加される（③で種目を選んだ瞬間に1セット目が登録される
                                  のと同じ方針）。各種目には目安セット（重量・回数）を追加/編集/
                                  削除でき（「＋目安セットを追加」で自重・10回のデフォルト値を
                                  追加後、重量・回数欄のblurで自動保存。他画面のセット編集と
                                  同じ方針）、種目の行自体には削除ボタンを持たない。目安セットを
                                  最後の1件まで削除すると、その種目自体もルーティンから削除される
                                  （`DELETE /routines/:id/exercises/:routineExerciseId`。
                                  「空になったら消える」という下記のルーティン全体の設計を
                                  routine_exercise単位にも揃えたもの）
                                  種目を1つも追加せずにこの画面を離れると、そのルーティンは
                                  自動的に削除される（空のルーティンを残さないため。ブラウザを
                                  閉じる等この離脱経路を通らない場合は取りこぼすが、その保険として
                                  `GET /routines`は種目0件のルーティンを返さない）
                                                       │
   ┌───────────────────────────────────┘
   │
   ③ 記録作成でできること
   │
   ├─「＋種目を追加」──> ④ 種目選択（/workouts/exercises）
   │                        部位ごとのセクション。各5件＋開閉で全件
   │                        │
   │                        ├─ 種目を選ぶ ──────────┐
   │                        │                          │
   │                        └─「＋種目を追加」──> ⑦ 種目追加（/workouts/exercises-new）
   │                                                   │  部位は④のセクションを引き継ぐ
   │                                                   │  追加した種目はそのまま選択済みになる
   │                                                   │  名前が既存種目と部分一致すると候補を表示
   │                                                   │  （タップで新規登録せずその種目を選択済みにできる）
   │                        ┌──────────────────┘
   │                        ▼
   │                   returnTo で元の画面へ戻る（既定は ③）
   │                   戻った直後、その種目の1セット目がデフォルト値（下記「＋セット追加」参照）で
   │                   即追加され、編集モードで開いた状態になる
   │
   ├─「＋ルーティンから選ぶ」（画面遷移せず、③の中でピッカーが開く）
   │      └─ ルーティンを選ぶと、種目ごとに以下のどちらかになる（[Issue #76](https://github.com/ConniConni/torebu/issues/76)）
   │           ・既に記録済み／入力待ち／入力中の種目は重複として除外される
   │           ・⑤で目安セット（重量・回数）を設定している種目は、その場で`workout_sets`として
   │             即登録される（`POST /workouts/:id/sets`を目安セットの件数分呼ぶ）。実際と違う分は
   │             記録済みセットの常時入力欄（blur自動保存）でそのまま手直しできる
   │           ・目安セットが未設定の種目は、従来どおり「入力待ちの種目」として積まれ、値は
   │             毎回手入力する
   │           ・⑤が0件なら、⑤への案内リンクが出る
   │           ・全種目が重複除外された場合、ピッカーを閉じずに理由を通知する
   │             （[Issue #80](https://github.com/ConniConni/torebu/issues/80)）
   │           ・一部の種目のみ重複除外された場合、ピッカーは閉じるが「◯件を追加しました
   │             （△件は記録済みのため除外）」と件数を通知する。通知はピッカーの外に表示され、
   │             閉じた後も残る（[Issue #84](https://github.com/ConniConni/torebu/issues/84)）
   │
   ├─「＋セット追加」→ デフォルト値で`POST /workouts/:id/sets`を即実行し、登録したそのセットの
   │      常時入力欄にそのまま値が反映される（⑤ルーティン編集の「＋目安セットを追加」と同じ方式、
   │      [Issue #91](https://github.com/ConniConni/torebu/issues/91)）。デフォルト値は
   │      **①今回のworkout内で既にそのセットがあれば直近のセット（setOrder最大） → ②前回実際に
   │      記録した値（`GET /exercises`の`lastSet`） → ③どちらも無ければ自重・10回**の優先順
   │      （[Issue #116](https://github.com/ConniConni/torebu/issues/116)。⑤の目安セット
   │      （ユーザーが手動設定した固定値）が適用される種目はこの優先順の対象外で、目安セットが
   │      引き続き最優先）
   │      ・④種目選択で種目を選んだ直後・「入力待ちの種目」をタップした直後も同様に、
   │        1セット目がこの方式で即追加される（①はまだ無いので②→③になる）
   │      ・記録済み種目カードの「＋セット追加」→ ④種目選択を経由せず、その場で同じ種目に
   │        セットを追加できる（「＋種目を追加」から同じ種目を選び直す手間を省く。この場合は
   │        既に①があるため直近セットの値がそのまま入る）
   │      ・「記録」ボタンは無く、離脱時に入力値が消える問題も無い（都度保存されるため）
   │
   ├─ 記録済みセットの値編集→ 重量・回数の入力欄は⑤ルーティンの目安セットと同じく
   │      **常時表示**（「編集」ボタンで切り替えるトグル方式は廃止、
   │      [Issue #95](https://github.com/ConniConni/torebu/issues/95)）。入力欄から
   │      フォーカスが外れる（blur）たびに自動保存される（`PATCH /workouts/:id/sets/:setId`）。
   │      明示的な「保存」ボタンは無い。「削除」も既存どおり利用可能。重量欄には`placeholder="自重"`
   │      ・セット数が増えると縦に伸びて見づらいため、種目単位で「セット／重量／回数」の
   │        ヘッダー帯を1回だけ表示し、各セットは1行のコンパクトな表形式（偶数行に背景色を
   │        付けたゼブラ縞）にする（ユーザー指摘、2026-09-05・Issue #95）。重量・回数の
   │        入力欄は種目カードの幅いっぱいまで伸ばし（右端に余白を残さない）、それぞれの
   │        入力欄の右に単位（kg・回）を添えることで見出しの文言を短くしている。⑤ルーティンの
   │        目安セット編集にも同じ見た目を水平展開して揃えている
   │        （[routines/\[id\].vue](../frontend/app/pages/routines/[id].vue)）
   │
   ├─ メモ入力（任意）→ 入力欄からフォーカスが外れる（blur）たびに自動保存される
   │      （`PATCH /workouts/:id`）。値が変わっていない場合はAPIを呼ばない
   │      ・空欄で保存するとメモをクリアできる
   │
   └─「ホームへ戻る」→ ② ホームへ戻る（旧「今日の記録を完了」と統合済み、下記参照）。
          記録本体の削除は③には無く、② ホームの記録カード側で行う（上記参照。
          Issue #127：③画面内で「ホームへ戻る」ボタンと隣り合っているのが紛らわしいという
          指摘を受けて移設した）
```

③のセット追加・編集・削除・メモ・記録削除は、いずれも操作のたびに即APIへ反映される設計のため、
ヘッダーの「ホームへ戻る」は記録を保存せずに戻るという意味ではない。かつては「今日の記録を完了」
（②ホームの記録一覧キャッシュを再取得してから戻る）と「ホームへ戻る」（素のリンクで再取得しない）
が別々のボタンとして存在し、後者で戻ると②に直前の変更が反映されないことがあった。両者は実質
同じ操作のため1つの「ホームへ戻る」に統合し、常に②のキャッシュを再取得してから遷移するように
した（[Issue #67](https://github.com/ConniConni/torebu/issues/67)）。

### 3-3. 画面をまたぐ状態の3つの持ち方 ← **ここが要注意**

③記録作成は、④種目選択や⑦種目追加へ**一度画面を離れてから戻ってくる**。
このとき「さっきまでの状態」をどう持ち越すかで、**3つの別々の仕組み**を使っている。
Issue10で判断がブレたのはここ。違いを押さえておく。

| 仕組み | 実体 | 何を運ぶか | ページを離れると |
|---|---|---|---|
| `useWorkoutSession` | `useState('workout-session')` | 進行中のworkoutId・performedAt・登録済みのセット一覧 | **残る**（`finishWorkout` を呼んだとき、またはログアウト時にリセット） |
| `usePickedExerciseId` | `useState('picked-exercise-id')` | ④⑦で選んだ種目を、戻り先の画面へ渡す | **残る**（戻り先が読み取ったら即クリアする。戻るボタンで再度開いてしまうのを防ぐため。ログアウト時にもリセット） |
| `usePendingExercises` | `useState('pending-exercises')` | ⑤ルーティン適用で積まれた「入力待ちの種目」リスト | **残る**（`finishWorkout` を呼んだとき、またはログアウト時にリセット） |
| `returnTo` | クエリパラメータ（URLに乗る） | ④⑦が「どこへ戻るか」（未指定なら `/workouts/new`） | **残る**（URLの一部なのでリロードしても消えない） |

**なぜ4つあるのか**
- ④⑦は③からもルーティン編集画面からも来る**共通画面**なので、戻り先を知る必要がある → `returnTo`
- 戻り先は「どの種目が選ばれたか」を知る必要がある → `usePickedExerciseId`
- ③は画面を離れている間も「今日のworkout」を保持し続ける必要がある → `useWorkoutSession`
- ③は④⑦への往復を挟んでも「入力待ちの種目」を保持し続ける必要がある → `usePendingExercises`
  （Issue13で作り込み、Issue #36で修正したバグの原因。当初 `ref` で持っていたため画面遷移で消えていた）

**横断ルール：画面をまたいで残したい状態は `ref` ではなく `useState` に置く。**

`ref` はそのページ専用なので、ページを離れた瞬間に中身が消える。`useState` はアプリ全体で共有されるので残る。

**注意点：`useState` はログアウトしても自動では消えない。** ログアウト→ログインは`navigateTo()`による
SPA内遷移（フルリロード無し）のため、上記3つに加えて `useExercises`（`exercises`）・`useWorkouts`
（`workouts`）・`useRoutines`（`routines`）のキャッシュも、明示的にリセットしないと同じブラウザタブで
別アカウントにログインし直したときに前のユーザーのデータが残ったまま表示されてしまう
（[Issue #111](https://github.com/ConniConni/torebu/issues/111)で発覚・修正）。そのため
[useAuth.ts](../frontend/app/composables/useAuth.ts)の`logout()`で、ユーザーに紐づく`useState`を
まとめてリセットしている。**新しく画面をまたぐ`useState`を追加したら、ここにも追記が必要。**

### 3-4. 日付の扱い

**日付は必ず [utils/date.ts](../frontend/app/utils/date.ts) の `toLocalDateString()` / `todayLocalDateString()` を使う。**

`Date#toISOString()` を使ってはいけない。あれはUTC基準で文字列にするため、
**日本時間の深夜0:00〜8:59に「今日」が前日にズレる**（JSTはUTC+9のため）。
APIとやり取りする日付（`performedAt`）は `YYYY-MM-DD` の文字列で統一している。

**③記録作成（`/workouts/new`）の`?date=`クエリ**は [utils/date.ts](../frontend/app/utils/date.ts) の
`resolveTargetDate()` で解決する。形式が不正・実在しない暦日（`2026-02-30`等）・未来日のいずれかであれば
今日にフォールバックする（フロント側のガードのみ。バックエンドAPI側に未来日を弾くバリデーションはまだ無い）。
解決した日付は `useWorkoutSession().startWorkout()` に渡され、同じ日付のworkoutが既にあれば再利用する。
**無ければ、この時点ではworkoutを作成しない**（`session.value.workoutId`は`null`のまま）。実際に
セット記録・メモ保存のいずれかを行うタイミングで`ensureWorkout()`が呼ばれ、そこで初めて
`POST /workouts`する（Issue #63）。③を開いただけ・種目を選んだだけで何も保存せずに離れた場合、
workout行自体が作られないため、②ホームに空の記録カードが残ることはない（何も保存しなければ
②に削除対象のカード自体が出ない、という形で結果的に同じことが保たれている）。

`startWorkout()` は `session.value.performedAt` と引数の`performedAt`が一致するときだけ
既存のセッションをそのまま使い回す（③⑥統合ステップ4で追加）。②の記録カードから日付の異なる
③へ直接遷移できるようになったため、日付が変われば必ずAPIから該当日のworkoutを取り直す。
これを怠ると、同じセッション内で別の日の③を開いたときに前の日のworkoutIdが残って
表示がずれる事故になる。

---

# ここから先は「引く章」

**通読しなくてよい。** 実装するときに必要になったら開く一覧。

---

## 4. API一覧（引く章）

全31エンドポイント。パスは省略記法（`...`）を使わず毎回フルで書く。
**リクエスト/レスポンスのフィールド一覧はここには書かない**
（コードを正とする。2箇所に書くと必ず食い違うため）。実際の形は各ルートファイルを見る。

### 認証まわり — [auth.ts](../backend/src/routes/auth.ts)

| メソッド | パス | 認証 | 役割 |
|---|---|---|---|
| POST | `/auth/register` | 不要 | ユーザー登録（登録だけ。ログイン状態にはならない） |
| POST | `/auth/login` | 不要 | ログイン。**レート制限あり**（同一IPから15分に10回まで） |
| GET | `/auth/me` | 要 | ログイン中のユーザー情報を返す |
| POST | `/auth/logout` | 要 | セッションを破棄する |

### 種目マスタ — [exercises.ts](../backend/src/routes/exercises.ts)

| メソッド | パス | 認証 | 役割 |
|---|---|---|---|
| GET | `/exercises` | 要 | 種目一覧。削除済み（後述）のカスタム種目も含む。各種目に前回の実績セット（`lastSet`）を含む |
| POST | `/exercises` | 要 | カスタム種目を追加する |
| DELETE | `/exercises/:id` | 要 | カスタム種目を削除する（**ソフトデリート**）。作成者本人のみ。公式種目・他人の種目・削除済みは`404` |

### トレーニング記録 — [workouts.ts](../backend/src/routes/workouts.ts)

| メソッド | パス | 認証 | 役割 |
|---|---|---|---|
| POST | `/workouts` | 要 | その日のworkoutを作る |
| GET | `/workouts` | 要 | 自分のworkout一覧（`performedAt` 降順）。各要素に`hasSets`（セットが1件以上あるか）を含む（②ホームのカレンダー印・記録カードの表示振り分けに使う。Issue #99） |
| GET | `/workouts/:id` | 要 | workout1件＋そのセット一覧 |
| PATCH | `/workouts/:id` | 要 | メモを更新する（記録日は編集不可。決めたこと#10参照） |
| DELETE | `/workouts/:id` | 要 | **ソフトデリート**（`deletedAt` を立てる） |
| POST | `/workouts/:id/sets` | 要 | セットを1件追加する |
| PATCH | `/workouts/:id/sets/:setId` | 要 | セットを1件更新する |
| DELETE | `/workouts/:id/sets/:setId` | 要 | セットを1件削除する（こちらは物理削除） |
| POST | `/workouts/:id/reactions` | 要 | いいねする（Phase4、[Issue #140](https://github.com/ConniConni/torebu/issues/140)）。**いずれかのアクティブなグループで同席しているメンバーの記録のみ**（`404`で存在を隠す）。**自分の記録には不可**（`400 cannot_react_to_own_workout`、[Issue #149](https://github.com/ConniConni/torebu/issues/149)で追加）。冪等（`upsert`。既にいいね済みでも`200`） |
| DELETE | `/workouts/:id/reactions` | 要 | いいねを取り消す。認可は`POST`と同じ。冪等（未いいねの状態で呼んでも`200`） |
| GET | `/workouts/:id/comments` | 要 | コメント一覧を`createdAt`昇順（古い順）で返す（Phase4、[Issue #142](https://github.com/ConniConni/torebu/issues/142)）。認可は`reactions`と同じ |
| POST | `/workouts/:id/comments` | 要 | コメントを投稿する。`body`必須（1〜500文字、`workouts.memo`と同じ上限）。認可は`reactions`と同じ |
| DELETE | `/workouts/:id/comments/:commentId` | 要 | コメントを削除する。**自分のコメントのみ**（他人のコメントを指定した場合も`404`） |

### ルーティン — [routines.ts](../backend/src/routes/routines.ts)

| メソッド | パス | 認証 | 役割 |
|---|---|---|---|
| POST | `/routines` | 要 | ルーティンを作る |
| GET | `/routines` | 要 | 自分のルーティン一覧（`createdAt` 降順）。種目が1件も無いルーティンは返さない（空のまま保存されたもの・離脱時自動削除の取りこぼし分。Issue #87） |
| GET | `/routines/:id` | 要 | ルーティン1件＋種目一覧 |
| PATCH | `/routines/:id` | 要 | 名前を変更する |
| DELETE | `/routines/:id` | 要 | 削除する（**物理削除**。中の種目はDB側のCascadeで一緒に消える） |
| POST | `/routines/:id/exercises` | 要 | ルーティンに種目を追加する（目安セットも任意で指定可） |
| PATCH | `/routines/:id/exercises/:routineExerciseId` | 要 | 並び順・目安セットを変更する（どちらか一方、または両方） |
| DELETE | `/routines/:id/exercises/:routineExerciseId` | 要 | ルーティンから種目を外す |

### 集計（Phase3-C） — [stats.ts](../backend/src/routes/stats.ts)

| メソッド | パス | 認証 | 役割 |
|---|---|---|---|
| GET | `/stats/volume` | 要 | 日別の合計負荷重量（`Σ weightKg × reps`）を返す。`range`クエリ（`1m`/`3m`/`all`、省略時`3m`）で対象期間を絞る |
| GET | `/stats/exercises/:exerciseId/history` | 要 | 指定した種目の、実施日ごとの最大重量・合計負荷重量の推移を返す。`range`クエリは`/stats/volume`と同じ |

### グループ（Phase4） — [groups.ts](../backend/src/routes/groups.ts)

| メソッド | パス | 認証 | 役割 |
|---|---|---|---|
| POST | `/groups` | 要 | グループを作成する。作成者は自動的に`role: owner`として参加する |
| GET | `/groups` | 要 | 自分が所属する（退会済みを除く）グループ一覧。各要素に自分の`role`を含む |
| GET | `/groups/:id` | 要 | グループ詳細＋アクティブなメンバー一覧。**所属メンバーのみ**閲覧可（`404`で存在を隠す） |
| GET | `/groups/:id/workouts` | 要 | グループのアクティブな全メンバー（本人含む）の記録を`performedAt`降順で返す。**所属メンバーのみ**閲覧可（`404`で存在を隠す）。各要素に投稿者情報（`userId`/`displayName`）、種目ごとのセット一覧（`exercises`：`exerciseId`/`name`/`sets`（`id`/`setOrder`/`weightKg`/`reps`）)、いいね情報（`reactionCount`/`reactedByMe`/`reactorNames`：いいねした人の表示名の配列、いいねした順。[Issue #149](https://github.com/ConniConni/torebu/issues/149)で追加）、コメント件数（`commentCount`）を含む |
| POST | `/groups/:id/invite` | 要 | 招待コードを再発行する。**オーナー限定**（オーナー以外は`403`） |
| POST | `/groups/join` | 要 | 招待コードで参加する。`member_limit`到達時は`400 member_limit_exceeded`、期限切れは`400 invite_expired`。退会済みメンバーの再参加は既存`group_members`行のUPDATE |
| POST | `/groups/:id/leave` | 要 | 退会する（`left_at`を立てるソフトデリート）。唯一のオーナーは`400 sole_owner_cannot_leave` |
| DELETE | `/groups/:id` | 要 | グループを削除する（**ソフトデリート**）。**オーナー限定**（オーナー以外は`403`） |
| GET | `/groups/:id/ranking` | 要 | グループのアクティブな全メンバー（本人含む）の合計挙上重量ランキングを返す。`period`クエリ（`week`/`month`/`all`、省略時`week`）で対象期間を切り替える |

### 通知（Phase4） — [notifications.ts](../backend/src/routes/notifications.ts)

| メソッド | パス | 認証 | 役割 |
|---|---|---|---|
| GET | `/notifications` | 要 | 自分宛の通知を`createdAt`降順（直近50件）で返す（[Issue #144](https://github.com/ConniConni/torebu/issues/144)）。既読化は行わない。対象の記録が削除済み（ソフトデリート含む）の通知は一覧から除外する |
| GET | `/notifications/unread-count` | 要 | 自分宛の未読件数のみを返す（②ホームのバッジ用。一覧取得より軽量にするため分離） |
| POST | `/notifications/read` | 要 | 自分宛の未読通知を一括既読化する。個別の既読トグルAPIは無い（通知一覧を開いたタイミングでフロントから呼ぶ想定） |

※ このほかに `GET /health`（認証不要、`{ status: 'ok' }` を返すだけ）がある。

### 4-1. 全エンドポイント共通のルール

- `/health` 以外は**すべて `requireAuth` を通る**。未ログインは `401 unauthenticated`
- エラーは `{ error: "コード", details?: ... }` の形で返す
  - `400 invalid_request` … zodの検証に落ちた（`details` に内訳が入る）
  - `404 not_found` … 存在しない、**または自分のものではない**
  - `401 unauthenticated` … 未ログイン
- **他人・削除済みのリソースは `403` ではなく `404`**（存在自体を隠す）
- 日付は `YYYY-MM-DD` の文字列でやり取りする

### 4-2. コードを読まないと分からない決定

| どこ | 押さえること |
|---|---|
| `GET /exercises` | 返すのは**公式種目（`createdBy` が null）＋自分が作ったカスタム種目**だけ。表示順は**「自分の使用回数の多い順 → 名前順」の2段階**（`default_sort_order` は全件null運用のためソート条件に入れていない）。各種目に `useCount`（自分の使用回数）が付いてくる。**削除済み（`deletedAt`有り）のカスタム種目もレスポンスには含める**（過去の記録・ルーティンがこのレスポンスをキャッシュして種目名を解決しているため、除外すると過去記録の表示が壊れる）。新規の記録・ルーティンへの追加候補からの除外は、`deletedAt`を見てフロント側（④種目選択・⑦種目追加の重複サジェスト）で行う |
| `GET /exercises` の `lastSet`（[Issue #116](https://github.com/ConniConni/torebu/issues/116)） | `{ weightKg, reps } \| null`。自分の削除されていない（`deletedAt: null`の）workoutの中で、その種目を一番新しく記録したセット1件（`performedAt`降順→`setOrder`降順で先頭）。記録が無ければ`null`。③記録作成でのセット追加のデフォルト値決定に使う（§3-2「＋セット追加」参照） |
| `POST /workouts/:id/sets`<br>`POST /routines/:id/exercises` | 種目の指定は`isExerciseVisible`（公式 or 自分のカスタム）で検証するが、**削除済みのカスタム種目は弾く**（`400 invalid_exercise`）。ただし`POST /workouts/:id/sets`は例外で、**そのworkoutに既にその種目のセットがある場合は削除済みでも追加できる**（新規の種目選択を伴わない、既存カードへの追加＝編集の延長とみなすため。Issue #113）。`POST /routines/:id/exercises`は常にルーティンへ新しい種目を紐付ける操作のためこの例外は無い（既存`routine_exercise`の目安セット編集は`PATCH`が別に担い、こちらは`isExerciseVisible`を呼ばないため削除済みでも編集できる） |
| `POST /workouts/:id/sets` | `setOrder` は**リクエストで指定できない**。サーバーが「同一workout・同一種目内の最大 + 1」で採番する。削除で欠番が出ても採番はズレない |
| 重量・回数の制約 | `weightKg` は正の数・**0.5kg刻み**・999.5kg以下。省略すると**自重（null）**扱い。`reps` は正の整数・999以下 |
| `PATCH /workouts/:id`<br>`PATCH /workouts/:id/sets/:setId` | **空のボディ `{}` は弾く**（最低1項目は必要）。何も変えないPATCHに意味がないため |
| `PATCH /workouts/:id` の `memo` | 空文字列・`null`を送るとメモを**クリア**（`null`化）できる。省略時のみ「変更しない」 |
| `GET /routines/:id` | **このエンドポイントだけ** `exercises[].exercise: { id, name, muscleGroup }` を埋め込んで返す。種目マスタを未取得のまま画面を開かれても名前が出せるようにするため。`POST` / `PATCH` のレスポンスはIDのみ |
| 種目の指定全般 | 記録にもルーティンにも、`GET /exercises` と同じ基準（公式 or 自分のカスタム）の種目しか使えない。違反は `400 invalid_exercise` |
| `routine_exercises` の `targetSets`（目安セット） | `[{ weightKg, reps }, ...]` の配列。`weightKg`・`reps` の制約は`workout_sets`と同じ（上記「重量・回数の制約」参照）。未設定は常に空配列 `[]` で返す（DB上は `null`）。`PATCH .../exercises/:routineExerciseId` は配列を丸ごと置き換える方式（1セットずつの更新APIは無い）。`targetSets: []` を送るとクリアできる |
| `GET /stats/volume`<br>`GET /stats/exercises/:exerciseId/history` | **集計対象は公式種目（`createdBy` が null）のみ**。カスタム種目のセットは集計から除外し、`/stats/exercises/:exerciseId/history`にカスタム種目のIDを渡すと`404`になる（2026-09-08決定、`docs/backlog.md`参照）。**`weightKg`が`null`の自重セットも集計から完全に除外する**（体重データを持たないため「挙上重量」を定義できない。0kg扱いにもしない）。日付は自分の削除されていない（`deletedAt: null`の）workoutの`performedAt`単位で集計し、データが無い日は結果配列に含めない（0埋めしない） |
| `GET /groups`<br>`GET /groups/:id`<br>`GET /groups/:id/workouts` | 「所属している」は`group_members`が**アクティブ**（`left_at IS NULL`）であること。退会済み（`left_at`あり）は未所属として扱う（`404`） |
| `GET /groups/:id/workouts` | 件数の絞り込み（ページネーション・期間指定）は行わない。既存の`GET /workouts`と同じく件数が増えたら対応する技術的負債として`docs/backlog.md`に記載済み |
| `POST /groups/join` | 「あと何人入れるか」は別カウンタを持たず、参加のたびに「アクティブな`group_members`数 < `member_limit`」を判定する（docs/schema.md「設計方針メモ」参照）。既にアクティブなメンバーが同じ招待コードで参加した場合は`member_limit`を再チェックせず`200`でそのまま返す（冪等） |
| `POST /groups/:id/leave` | オーナーの退会可否は「そのグループの**アクティブなオーナー数**」で判定する（`role`が`owner`かつ`left_at IS NULL`の行数）。1人なら`400 sole_owner_cannot_leave` |
| `DELETE /groups/:id` | **ソフトデリート**（`groups.deleted_at`）。`group_members`側は変更しない。削除後は全メンバーが`GET /groups/:id`等で`404`になる |
| `POST/DELETE /workouts/:id/reactions` | 対象workoutへのアクセス可否は「自分の記録、または対象の投稿者といずれかのアクティブなグループで同席しているか」（`shareActiveGroup`関数）で判定する。グループ単位ではなく**ユーザー単位**の判定のため、`groups`のエンドポイント群ではなく`workouts.ts`に実装している。ただし`POST`はこのアクセス可否とは別に、**対象が自分の記録なら`400`**（[Issue #149](https://github.com/ConniConni/torebu/issues/149)。理由は§3-2の実装メモ参照）。`DELETE`は自分の記録も含め常に許可（元々いいねできないため実質何もしない） |
| `GET/POST /workouts/:id/comments`<br>`DELETE /workouts/:id/comments/:commentId` | 認可は`reactions`と同じ`shareActiveGroup`関数を再利用。削除は`userId`一致も条件に加えるため、自分のコメント以外は`404` |
| いいね・コメント作成時の通知 | `POST /workouts/:id/reactions`・`POST /workouts/:id/comments`（[workouts.ts](../backend/src/routes/workouts.ts)）が、対象workoutの投稿者宛に`notifications`を作成する（`notifyWorkoutOwner`関数）。**投稿者が自分自身（自分の記録への自分の操作）の場合は作成しない**。いいねは`upsert`で冪等だが、通知は**新規いいね時のみ**作成する（連打で複製しないよう、`upsert`の前に既存いいねの有無を確認している）。通知APIを直接叩いて作る手段は無く、常にこの2エンドポイントの副作用として作られる。**コメントは投稿者に加え、そのworkoutへの過去のコメント投稿者（スレッド参加者）にも`type: comment_reply`で通知する**（`notifyCommentParticipants`関数、[Issue #149](https://github.com/ConniConni/torebu/issues/149)）。自分自身・投稿者（`comment`で通知済み）は宛先から除く |
| `GET /groups/:id/ranking` | **集計対象は公式種目のみ**（`stats.ts`と同じ方針）。ただし`stats.ts`と異なり**自重セット（`weightKg`が`null`）は除外せず0kg扱いで加算する**（schema.md「Phase4の検討結果」参照。合計に影響はしないが、記録自体はランキングの母数に含める）。`period=week`は日曜起算、`month`は1日起算（Phase3-Dの週定義と統一）で「現在の期間の開始日時以降」を集計し、`all`は期間の下限を設けない。過去の期間（先週・先月等）を見る機能は無い。記録が無いメンバーも`totalVolumeKg: 0`で結果に含める。同着は同順位、次の順位は人数分スキップする（例：1位2人なら次点は3位ではなく3人目時点で3位＝1,1,3） |
| `GET /notifications` | 対象は**自分の記録（`type: reaction`/`comment`）**、または**自分もコメントしたことがある記録に他の人がコメントしたとき（`type: comment_reply`、[Issue #149](https://github.com/ConniConni/torebu/issues/149)）**。`target`には表示用にworkoutを要約した情報（`performedAt`・先頭の種目名`exerciseName`・種目数`exerciseCount`）に加え、リンク先解決用の`groupId`（actorと自分が現在も同席しているアクティブなグループ、無ければ`null`）を含める。要約は**取得時点の現在の状態**を都度引き直したもので、通知作成時点のスナップショットではない（記録を後から編集すると通知側の表示も追従する） |

---

## 5. データモデル（引く章）

正は [schema.prisma](../backend/prisma/schema.prisma)。実装済みは以下の11テーブル。

| テーブル | 役割 | 押さえること |
|---|---|---|
| `users` | ユーザー | `password_hash` にbcryptハッシュを保存。`password_reset_*` カラムはあるが**API未実装**（§2-1） |
| `exercises` | 種目マスタ | `created_by` が **null なら公式種目**、値が入っていればその人のカスタム種目。`default_sort_order` は全件null運用。公式種目77件（部位ハイライト用データ付き）を `backend/prisma/seed.ts` で投入済み（`npm run prisma:seed`。複数回実行しても重複しない。旧マスタからの入れ替え時は旧種目とそれを参照する`workout_sets`/`routine_exercises`を削除してから新規投入する）。`main_muscle`/`related_muscles`/`main_zone`は部位ハイライト可視化（Phase2、[muscle-highlight.md](./muscle-highlight.md)参照）用のnullableカラムで、**カスタム種目では常にnull／空配列**。④種目選択画面の部位ハイライトシート（§3-1参照）で使用。**`deleted_at`を持つ（ソフトデリート）**：カスタム種目を作成者本人が`DELETE /exercises/:id`で削除できる（公式種目は対象外、[Issue #113](https://github.com/ConniConni/torebu/issues/113)） |
| `workouts` | 1日1回分のトレーニング | `deleted_at` を持つ（ソフトデリート） |
| `workout_sets` | セット1件（重量・回数） | `weight_kg` は **nullable = 自重種目**。`set_order` はサーバー採番 |
| `routines` | 「胸の日」等のテンプレート | 物理削除 |
| `routine_exercises` | ルーティンに入っている種目と並び順 | `target_sets`（jsonb、nullable）に目安セット（重量・回数の配列）を持てる。未設定は`null`（APIレスポンスでは`[]`に正規化。§4-2参照） |
| `groups`（Phase4） | グループ本体 | `invite_code`は英数字約32文字（`crypto.randomBytes`によるbase64url）で`UNIQUE`。`invite_expires_at`は発行/再発行のたびに現在時刻+30日で更新（§3-1「グループ機能の実装メモ」参照）。`member_limit`はデフォルト10（将来課金で拡張、Phase5）。**`deleted_at`を持つ（ソフトデリート）**、削除は`role: owner`のメンバーのみ実行可 |
| `group_members`（Phase4） | グループへの所属 | 複合PK（`group_id`, `user_id`）。`role`は`owner`/`member`のenum、**ownerは複数人可**。**退会してもレコードは物理削除しない**（`left_at`で論理管理）。再参加は新規INSERTではなく既存行の`left_at`をNULLに戻すUPDATEで行う（退会後も過去の記録・カスタム種目が仲間から見え続ける設計のため。docs/schema.md「設計方針メモ」参照） |
| `reactions`（Phase4） | いいね | `target_type`（enum：`workout`/`workout_set`/`topic_post`）＋`target_id`の汎用テーブル。**現状発行されるのは`workout`のみ**（[Issue #140](https://github.com/ConniConni/torebu/issues/140)、`workout_set`/`topic_post`は対象UI未実装）。`target_id`はFK制約なし（対象が`target_type`によって変わるため）、対象の存在・アクセス権はアプリ側（`workouts.ts`）で検証する。`UNIQUE(target_type, target_id, user_id)`で1人1いいねを保証 |
| `comments`（Phase4） | コメント | `target_type`（enum：`workout`/`topic_post`）＋`target_id`の汎用テーブル。**現状発行されるのは`workout`のみ**（[Issue #142](https://github.com/ConniConni/torebu/issues/142)、`topic_post`は対象UI未実装）。`target_id`はFK制約なし、対象の存在・アクセス権はアプリ側（`workouts.ts`）で検証する。`reactions`と異なり1人が複数回投稿できるため`UNIQUE`制約は無い |
| `notifications`（Phase4） | 通知 | `recipient_id`（誰宛）／`actor_id`（誰が起こしたか、nullable）／`type`（enum：`reaction`/`comment`/`comment_reply`/`topic`/`ranking`/`exercise_promoted`。`comment_reply`は[Issue #149](https://github.com/ConniConni/torebu/issues/149)で追加）／`target_type`（enum：`workout`/`workout_set`/`topic_post`/`topic`/`exercise`/`group`）＋`target_id`の汎用テーブル。**現状発行されるのは`type: reaction`/`comment`/`comment_reply`、`target_type: workout`のみ**（[Issue #144](https://github.com/ConniConni/torebu/issues/144)・#149。残りの`type`/`target_type`はランキング・イチオシこだわり共有・種目昇格が未実装のため発行しない、docs/schema.mdの設計をそのまま反映）。`target_id`はFK制約なし、対象の存在確認はアプリ側（`notifications.ts`）で行う。`recipient_id`は`onDelete: Cascade`（受信者退会でまとめて消える）、`actor_id`は`onDelete: SetNull`（行為者が退会しても通知自体は残る） |

**`sessions` テーブルについて**：DBには存在するが、**Prismaのマイグレーション管理外**。
`connect-pg-simple` が `sid` / `sess` / `expire` の3カラムで自動作成・管理している
（[session.ts](../backend/src/session.ts) の `createTableIfMissing: true`）。
そのため `schema.prisma` には書かれていない。

**部位（`MuscleGroup`）の7分類**：`chest` 胸 / `back` 背中 / `legs` 脚 / `shoulders` 肩 / `arms` 腕 /
`glutes` お尻 / `abs` 腹筋。日本語ラベルの対応は [muscleGroup.ts](../frontend/app/utils/muscleGroup.ts)
（Prismaの生成物をフロントで直接importしないため、値を複製して持っている）。

---

## 6. 実装済みのセキュリティ対策（引く章）

[schema.md](./schema.md) の「セキュリティ実装の優先度」表のうち、**実際にコードに入っているもの**だけを挙げる。

| 対策 | 実装 |
|---|---|
| パスワードのハッシュ化 | bcrypt、ソルトラウンド12（[auth.ts](../backend/src/routes/auth.ts)） |
| ログイン試行のレート制限 | 同一IPから15分に10回まで（テスト時は無効化） |
| メールアドレス列挙対策 | ユーザーが存在しなくてもダミーハッシュと比較し、応答時間とエラー内容を揃える |
| セッション固定化対策 | ログイン成功時に `req.session.regenerate()` でセッションIDを振り直す |
| Cookieの属性 | `HttpOnly` / `Secure`（本番のみ） / `SameSite=Lax` / 有効期限14日（[session.ts](../backend/src/session.ts)） |
| CSRF対策 | `SameSite=Lax` のみ。**フロントとバックを同一サイトに揃えている前提**で成立している（§1-1） |
| 認可（IDOR対策） | 自分のリソースかを必ず確認し、違えば `404`（`findOwnWorkout` / `findOwnRoutine`） |

**注意**：`POST /auth/register` は「このメールアドレスは既に登録されています（`409`）」を返すため、
列挙対策の対象外にしている。登録画面では重複を伝える必要があるため、意図的な判断
（対策はログインAPI側で行っている）。
