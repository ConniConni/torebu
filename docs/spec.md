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
| **種目名の重複サジェスト表示** | ⑦種目追加で名前を入力している最中に「似た名前の種目がすでにあります」と候補を出す機能のこと（*サジェスト＝入力途中に候補を提示すること*）。「ベンチプレス」と「ベンチ・プレス」のような表記ゆれを、登録される前に本人に気づかせる狙い。[schema.md](./schema.md) では「DBの制約で禁止するのではなく、この表示で防ぐ」と決定されているが、[exercises-new.vue](../frontend/app/pages/workouts/exercises-new.vue) にも `POST /exercises` にも**実装がない**。つまり表記ゆれを防ぐ手段が今どこにもない |
| **種目の表示順** | docsでは「使用回数 → `default_sort_order` → 名前順」の3段階だが、実装は**2段階**（使用回数 → 名前順）。`default_sort_order` を全件null運用にしたための意図的な省略だが、docs側が更新されていない |
| **パスワードリセット** | `users` に `password_reset_token` / `password_reset_expires_at` カラムはあるが、**APIは未実装** |
| **記録のメモ欄** | `PATCH /workouts/:id` の `memo` はAPI実装済みだが、③記録作成に**入力欄がない**ためフロントから使えない |

---

## 3. 画面と、画面をまたぐ状態の持ち方（読む章）

### 3-1. 画面一覧（実装済み9ページ）

丸数字は [concept.md](./concept.md) / [screens.md](./screens.md) で使っている画面番号。

| パス | 画面 | 役割 | 主に使うAPI | ミドルウェア |
|---|---|---|---|---|
| `/login` | ① | ログイン | `POST /auth/login` | `guest` |
| `/register` | ① | 新規登録 | `POST /auth/register` → 続けて `POST /auth/login` | `guest` |
| `/` | ② | ホーム（カレンダー） | `GET /workouts`, `POST /auth/logout` | `auth` |
| `/workouts/new` | ③ | 記録作成（本体画面） | `POST /workouts`, `POST /workouts/:id/sets`, `DELETE /workouts/:id/sets/:setId`, `GET /exercises`, `GET /routines`, `GET /routines/:id` | `auth` |
| `/workouts/exercises` | ④ | 種目選択 | `GET /exercises` | `auth` |
| `/workouts/exercises-new` | ⑦ | 種目追加 | `POST /exercises` | `auth` |
| `/routines` | ⑤ | ルーティン一覧 | `GET /routines`, `POST /routines` | `auth` |
| `/routines/[id]` | ⑤ | ルーティン編集 | `GET/PATCH/DELETE /routines/:id`, `POST/PATCH/DELETE /routines/:id/exercises` | `auth` |
| `/workouts/[id]` | ⑥ | 記録詳細 | `GET /workouts/:id`, `GET /exercises` | `auth` |

**ミドルウェアの意味**
- `auth`（[auth.ts](../frontend/app/middleware/auth.ts)）：未ログインなら `/login` へ飛ばす
- `guest`（[guest.ts](../frontend/app/middleware/guest.ts)）：ログイン済みなら `/` へ飛ばす

### 3-2. 記録するときの流れ（実装どおり）

```
② ホーム（/）
 │
 ├─「＋今日の記録を始める」──────────> ③ 記録作成（/workouts/new）
 │   ※ 入口は「今日」固定。カレンダーで              │
 │      過去日を選んでも記録作成には繋がらない        │
 │                                                    │
 └─「ルーティン」─────> ⑤ 一覧（/routines）          │
                            │                          │
                            └─> ⑤ 編集（/routines/[id]）
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
   │                        ┌──────────────────┘
   │                        ▼
   │                   returnTo で元の画面へ戻る（既定は ③）
   │                   戻った直後、その種目のセット入力欄が開いた状態になる
   │
   ├─「＋ルーティンから選ぶ」（画面遷移せず、③の中でピッカーが開く）
   │      └─ ルーティンを選ぶと、その種目一式が「入力待ちの種目」として積まれる
   │           ・既に記録済み／入力待ち／入力中の種目は重複として除外される
   │           ・ルーティンは重量・回数の目安値を持たないため、値は毎回手入力する
   │           ・⑤が0件なら、⑤への案内リンクが出る
   │
   ├─ セット入力（重量・回数）→「記録」を押すたびに1件ずつ保存される
   │      ・重量欄は次のセットのためにあえてクリアしない（同じ重量が続くことが多いため）
   │      ・「この種目の入力を終える」で入力欄を閉じる
   │
   └─「今日の記録を完了」──> ② ホームへ戻る
```

### 3-3. 画面をまたぐ状態の3つの持ち方 ← **ここが要注意**

③記録作成は、④種目選択や⑦種目追加へ**一度画面を離れてから戻ってくる**。
このとき「さっきまでの状態」をどう持ち越すかで、**3つの別々の仕組み**を使っている。
Issue10で判断がブレたのはここ。違いを押さえておく。

| 仕組み | 実体 | 何を運ぶか | ページを離れると |
|---|---|---|---|
| `useWorkoutSession` | `useState('workout-session')` | 進行中のworkoutIdと、登録済みのセット一覧 | **残る**（`finishWorkout` を呼んだときだけリセット） |
| `usePickedExerciseId` | `useState('picked-exercise-id')` | ④⑦で選んだ種目を、戻り先の画面へ渡す | **残る**（戻り先が読み取ったら即クリアする。戻るボタンで再度開いてしまうのを防ぐため） |
| `returnTo` | クエリパラメータ（URLに乗る） | ④⑦が「どこへ戻るか」（未指定なら `/workouts/new`） | **残る**（URLの一部なのでリロードしても消えない） |

**なぜ3つあるのか**
- ④⑦は③からもルーティン編集画面からも来る**共通画面**なので、戻り先を知る必要がある → `returnTo`
- 戻り先は「どの種目が選ばれたか」を知る必要がある → `usePickedExerciseId`
- ③は画面を離れている間も「今日のworkout」を保持し続ける必要がある → `useWorkoutSession`

**横断ルール：画面をまたいで残したい状態は `ref` ではなく `useState` に置く。**

`ref` はそのページ専用なので、ページを離れた瞬間に中身が消える。`useState` はアプリ全体で共有されるので残る。

> **このルールに違反している既知のバグ（MVP完成後の棚卸しで発見。修正は次のIssue以降）**
>
> [workouts/new.vue](../frontend/app/pages/workouts/new.vue) の `pendingExercises`（ルーティンから展開された
> 「入力待ちの種目」リスト）は、`useState` ではなく**ページ専用の `ref` になっている**。
> そのため次の手順で消える：
>
> 1. ルーティンを適用して「入力待ちの種目」が5件並ぶ
> 2. そのうち1件の入力を終えて「＋種目を追加」で④へ移動する
> 3. ③に戻ると、**残り4件が消えている**
>
> 同じファイルの `activeExerciseId` は `usePickedExerciseId`（＝`useState`）経由で保持されているのに、
> `pendingExercises` だけ `ref` のまま、という食い違いになっている。

### 3-4. 日付の扱い

**日付は必ず [utils/date.ts](../frontend/app/utils/date.ts) の `toLocalDateString()` / `todayLocalDateString()` を使う。**

`Date#toISOString()` を使ってはいけない。あれはUTC基準で文字列にするため、
**日本時間の深夜0:00〜8:59に「今日」が前日にズレる**（JSTはUTC+9のため）。
APIとやり取りする日付（`performedAt`）は `YYYY-MM-DD` の文字列で統一している。

---

# ここから先は「引く章」

**通読しなくてよい。** 実装するときに必要になったら開く一覧。

---

## 4. API一覧（引く章）

全22エンドポイント。パスは省略記法（`...`）を使わず毎回フルで書く。
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
| GET | `/exercises` | 要 | 種目一覧 |
| POST | `/exercises` | 要 | カスタム種目を追加する |

### トレーニング記録 — [workouts.ts](../backend/src/routes/workouts.ts)

| メソッド | パス | 認証 | 役割 |
|---|---|---|---|
| POST | `/workouts` | 要 | その日のworkoutを作る |
| GET | `/workouts` | 要 | 自分のworkout一覧（`performedAt` 降順） |
| GET | `/workouts/:id` | 要 | workout1件＋そのセット一覧 |
| PATCH | `/workouts/:id` | 要 | 記録日・メモを更新する |
| DELETE | `/workouts/:id` | 要 | **ソフトデリート**（`deletedAt` を立てる） |
| POST | `/workouts/:id/sets` | 要 | セットを1件追加する |
| PATCH | `/workouts/:id/sets/:setId` | 要 | セットを1件更新する |
| DELETE | `/workouts/:id/sets/:setId` | 要 | セットを1件削除する（こちらは物理削除） |

### ルーティン — [routines.ts](../backend/src/routes/routines.ts)

| メソッド | パス | 認証 | 役割 |
|---|---|---|---|
| POST | `/routines` | 要 | ルーティンを作る |
| GET | `/routines` | 要 | 自分のルーティン一覧（`createdAt` 降順） |
| GET | `/routines/:id` | 要 | ルーティン1件＋種目一覧 |
| PATCH | `/routines/:id` | 要 | 名前を変更する |
| DELETE | `/routines/:id` | 要 | 削除する（**物理削除**。中の種目はDB側のCascadeで一緒に消える） |
| POST | `/routines/:id/exercises` | 要 | ルーティンに種目を追加する |
| PATCH | `/routines/:id/exercises/:routineExerciseId` | 要 | 並び順を変更する |
| DELETE | `/routines/:id/exercises/:routineExerciseId` | 要 | ルーティンから種目を外す |

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
| `GET /exercises` | 返すのは**公式種目（`createdBy` が null）＋自分が作ったカスタム種目**だけ。表示順は**「自分の使用回数の多い順 → 名前順」の2段階**（`default_sort_order` は全件null運用のためソート条件に入れていない）。各種目に `useCount`（自分の使用回数）が付いてくる |
| `POST /workouts/:id/sets` | `setOrder` は**リクエストで指定できない**。サーバーが「同一workout・同一種目内の最大 + 1」で採番する。削除で欠番が出ても採番はズレない |
| 重量・回数の制約 | `weightKg` は正の数・**0.5kg刻み**・999.5kg以下。省略すると**自重（null）**扱い。`reps` は正の整数・999以下 |
| `PATCH /workouts/:id`<br>`PATCH /workouts/:id/sets/:setId` | **空のボディ `{}` は弾く**（最低1項目は必要）。何も変えないPATCHに意味がないため |
| `GET /routines/:id` | **このエンドポイントだけ** `exercises[].exercise: { id, name, muscleGroup }` を埋め込んで返す。種目マスタを未取得のまま画面を開かれても名前が出せるようにするため。`POST` / `PATCH` のレスポンスはIDのみ |
| 種目の指定全般 | 記録にもルーティンにも、`GET /exercises` と同じ基準（公式 or 自分のカスタム）の種目しか使えない。違反は `400 invalid_exercise` |

---

## 5. データモデル（引く章）

正は [schema.prisma](../backend/prisma/schema.prisma)。実装済みは以下の6テーブル。

| テーブル | 役割 | 押さえること |
|---|---|---|
| `users` | ユーザー | `password_hash` にbcryptハッシュを保存。`password_reset_*` カラムはあるが**API未実装**（§2-1） |
| `exercises` | 種目マスタ | `created_by` が **null なら公式種目**、値が入っていればその人のカスタム種目。`default_sort_order` は全件null運用 |
| `workouts` | 1日1回分のトレーニング | **`deleted_at` を持つ唯一のテーブル**（ソフトデリート） |
| `workout_sets` | セット1件（重量・回数） | `weight_kg` は **nullable = 自重種目**。`set_order` はサーバー採番 |
| `routines` | 「胸の日」等のテンプレート | 物理削除 |
| `routine_exercises` | ルーティンに入っている種目と並び順 | **重量・回数の目安値は持たない**（毎回手入力する前提） |

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
