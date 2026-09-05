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
| 5 | ソフトデリートは **`workouts` だけ** | 将来 reactions/comments から参照されるテーブルだけが対象。全部に付けるとクエリが複雑になる |
| 6 | 記録は**種目ごとに都度保存**。セット追加も「＋セット追加」を押した瞬間にデフォルト値（自重・10回）で即保存し、その場でblur自動保存の編集欄で手直しする方式（[Issue #91](https://github.com/ConniConni/torebu/issues/91)） | ジムでの実際の動き（1種目終わったら次へ）に合わせた。まとめて最後に保存する形にしない。当初は「入力してから『記録』ボタンを押す」方式だったが、⑤・セット編集・メモ保存が自動保存に統一される中で③だけ非対称だったため統一した |
| 7 | 他人のリソースは **`403` ではなく `404`** | 存在自体を隠すため |
| 8 | `setOrder` は**サーバーが採番** | クライアント指定だと連続追加で番号がぶつかるため |
| 9 | 種目マスタに**削除機能を作らない** | 過去の記録が参照している種目を消すと記録が壊れるため |
| 10 | 記録日は**作成後は編集不可**。②ホームの「＋今日の記録を始める」ボタンは**「今日」固定のまま** | 過去日対応は画面設計ごとの見直しが必要になるため、意図的に切り離した。記録日を編集可能にすると、③の「同じ日付のworkoutがあれば再開する」という日付ベースの引き当てと噛み合わず、記録が実質二重になる事故につながる。**③のページ自体はIssue #52で`?date=`クエリに対応済み**（下記③の行・§3-4参照）で、**②の既存記録カード（過去日含む）から③へ日付付きで遷移する導線は実装済み**（⑥廃止・統合ステップ4）。**②のカレンダーで過去日を選んで記録が0件のときに③を開始する導線もIssue #61で実装済み**（未来日は③側で今日にクランプされ紛らわしいため対象外） |

### 2-1. 決めたが、まだ実装されていないこと

MVP完成後の棚卸しで見つかった、**ドキュメントと実装のズレ**。
「決めたはずなのに入っていない」ものなので、判断がブレる原因になる。一覧は
[backlog.md](./backlog.md) の「ドキュメントと実装のズレ」を見る。

---

## 3. 画面と、画面をまたぐ状態の持ち方（読む章）

### 3-1. 画面一覧（実装済み8ページ）

丸数字は [concept.md](./concept.md) で使っている画面番号。**⑥記録詳細は③記録作成に統合されて廃止した**
（③⑥統合ステップ4。②の記録カードのリンク先も⑥→③に切り替え済み。経緯は
[roadmap.md](./roadmap.md)「③記録作成・⑥記録詳細の統合」参照）。

| パス | 画面 | 役割 | 主に使うAPI | ミドルウェア |
|---|---|---|---|---|
| `/login` | ① | ログイン | `POST /auth/login` | `guest` |
| `/register` | ① | 新規登録 | `POST /auth/register` → 続けて `POST /auth/login` | `guest` |
| `/` | ② | ホーム（カレンダー） | `GET /workouts`, `GET /workouts/:id`, `POST /auth/logout` | `auth` |
| `/workouts/new`<br>（`?date=YYYY-MM-DD`任意） | ③ | 記録作成・記録の見返し（本体画面。今日の新規記録も過去日の記録の見返し・編集・削除も1画面で担う） | `POST /workouts`, `PATCH /workouts/:id`, `DELETE /workouts/:id`, `POST /workouts/:id/sets`, `PATCH/DELETE /workouts/:id/sets/:setId`, `GET /exercises`, `GET /routines`, `GET /routines/:id` | `auth` |
| `/workouts/exercises` | ④ | 種目選択 | `GET /exercises` | `auth` |
| `/workouts/exercises-new` | ⑦ | 種目追加 | `POST /exercises` | `auth` |
| `/routines` | ⑤ | ルーティン一覧 | `GET /routines`, `POST /routines`, `DELETE /routines/:id` | `auth` |
| `/routines/[id]` | ⑤ | ルーティン編集 | `GET/PATCH/DELETE /routines/:id`, `POST/PATCH/DELETE /routines/:id/exercises` | `auth` |

**ミドルウェアの意味**
- `auth`（[auth.ts](../frontend/app/middleware/auth.ts)）：未ログインなら `/login` へ飛ばす
- `guest`（[guest.ts](../frontend/app/middleware/guest.ts)）：ログイン済みなら `/` へ飛ばす

### 3-2. 記録するときの流れ（実装どおり）

```
② ホーム（/）
 │
 ├─「＋今日の記録を始める」──────────> ③ 記録作成（/workouts/new）
 │   ※ 常に「今日」固定                              │
 │                                                    │
 ├─ 記録カード（過去日含む）を選ぶ ───> ③（/workouts/new?date=その日）
 │   ※ 記録の見返し・編集・削除もここで行う           │
 │      （⑥記録詳細は廃止し③に統合済み）             │
 │                                                    │
 ├─ カレンダーで過去日を選び、その日の記録が0件 ─────>│
 │   「＋この日の記録を始める」                      ③（/workouts/new?date=その日）
 │   ※ 未来日を選んだ場合は導線を出さない             │
 │      （③側で未来日は今日にクランプされるため）    │
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
   │                   戻った直後、その種目の1セット目がデフォルト値で即追加され、編集モードで開いた状態になる
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
   ├─「＋セット追加」→ デフォルト値（自重・10回）で`POST /workouts/:id/sets`を即実行し、
   │      登録したそのセットの常時入力欄にそのまま値が反映される（⑤ルーティン編集の
   │      「＋目安セットを追加」と同じ方式、[Issue #91](https://github.com/ConniConni/torebu/issues/91)）。
   │      ・④種目選択で種目を選んだ直後・「入力待ちの種目」をタップした直後も同様に、
   │        1セット目がこの方式で即追加される
   │      ・記録済み種目カードの「＋セット追加」→ ④種目選択を経由せず、その場で同じ種目に
   │        セットを追加できる（「＋種目を追加」から同じ種目を選び直す手間を省く）
   │      ・「記録」ボタンは無く、離脱時に入力値が消える問題も無い（都度保存されるため）
   │
   ├─ 記録済みセットの値編集→ 重量・回数の入力欄は⑤ルーティンの目安セットと同じく
   │      **常時表示**（「編集」ボタンで切り替えるトグル方式は廃止、
   │      [Issue #95](https://github.com/ConniConni/torebu/issues/95)）。入力欄から
   │      フォーカスが外れる（blur）たびに自動保存される（`PATCH /workouts/:id/sets/:setId`）。
   │      明示的な「保存」ボタンは無い。「削除」も既存どおり利用可能。重量欄には`placeholder="自重"`
   │      ・セット数が増えると縦に伸びて見づらいため、種目単位で「セット数／重量(kg・自重は
   │        空欄)／回数」のヘッダーを1回だけ表示し、各セットは1行のコンパクトな表形式にする
   │        （ユーザー指摘、2026-09-05・Issue #95）。⑤ルーティンの目安セット編集にも同じ
   │        見た目を水平展開して揃えている（[routines/\[id\].vue](../frontend/app/pages/routines/[id].vue)）
   │
   ├─ メモ入力（任意）→ 入力欄からフォーカスが外れる（blur）たびに自動保存される
   │      （`PATCH /workouts/:id`）。値が変わっていない場合はAPIを呼ばない
   │      ・空欄で保存するとメモをクリアできる
   │
   └─「ホームへ戻る」→ ② ホームへ戻る（旧「今日の記録を完了」と統合済み、下記参照）。
          「この記録を削除」→ 画面内の2段階確認（削除する／キャンセル）を経て
          `DELETE /workouts/:id`（論理削除）。削除後は② ホームへ戻る
          （`window.confirm()`は使わない、理由はbacklog.md参照）
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
| `useWorkoutSession` | `useState('workout-session')` | 進行中のworkoutId・performedAt・登録済みのセット一覧 | **残る**（`finishWorkout` を呼んだときだけリセット） |
| `usePickedExerciseId` | `useState('picked-exercise-id')` | ④⑦で選んだ種目を、戻り先の画面へ渡す | **残る**（戻り先が読み取ったら即クリアする。戻るボタンで再度開いてしまうのを防ぐため） |
| `usePendingExercises` | `useState('pending-exercises')` | ⑤ルーティン適用で積まれた「入力待ちの種目」リスト | **残る**（`finishWorkout` を呼んだときだけリセット） |
| `returnTo` | クエリパラメータ（URLに乗る） | ④⑦が「どこへ戻るか」（未指定なら `/workouts/new`） | **残る**（URLの一部なのでリロードしても消えない） |

**なぜ4つあるのか**
- ④⑦は③からもルーティン編集画面からも来る**共通画面**なので、戻り先を知る必要がある → `returnTo`
- 戻り先は「どの種目が選ばれたか」を知る必要がある → `usePickedExerciseId`
- ③は画面を離れている間も「今日のworkout」を保持し続ける必要がある → `useWorkoutSession`
- ③は④⑦への往復を挟んでも「入力待ちの種目」を保持し続ける必要がある → `usePendingExercises`
  （Issue13で作り込み、Issue #36で修正したバグの原因。当初 `ref` で持っていたため画面遷移で消えていた）

**横断ルール：画面をまたいで残したい状態は `ref` ではなく `useState` に置く。**

`ref` はそのページ専用なので、ページを離れた瞬間に中身が消える。`useState` はアプリ全体で共有されるので残る。

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
workout行自体が作られないため、②ホームに空の記録カードが残ることはない。この間、③側では
「今日の記録を完了」ボタンと「この記録を削除」セクションを表示しない（`workoutId`が無い＝
完了・削除するものがまだ無いため）。

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
| PATCH | `/workouts/:id` | 要 | メモを更新する（記録日は編集不可。決めたこと#10参照） |
| DELETE | `/workouts/:id` | 要 | **ソフトデリート**（`deletedAt` を立てる） |
| POST | `/workouts/:id/sets` | 要 | セットを1件追加する |
| PATCH | `/workouts/:id/sets/:setId` | 要 | セットを1件更新する |
| DELETE | `/workouts/:id/sets/:setId` | 要 | セットを1件削除する（こちらは物理削除） |

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
| `PATCH /workouts/:id` の `memo` | 空文字列・`null`を送るとメモを**クリア**（`null`化）できる。省略時のみ「変更しない」 |
| `GET /routines/:id` | **このエンドポイントだけ** `exercises[].exercise: { id, name, muscleGroup }` を埋め込んで返す。種目マスタを未取得のまま画面を開かれても名前が出せるようにするため。`POST` / `PATCH` のレスポンスはIDのみ |
| 種目の指定全般 | 記録にもルーティンにも、`GET /exercises` と同じ基準（公式 or 自分のカスタム）の種目しか使えない。違反は `400 invalid_exercise` |
| `routine_exercises` の `targetSets`（目安セット） | `[{ weightKg, reps }, ...]` の配列。`weightKg`・`reps` の制約は`workout_sets`と同じ（上記「重量・回数の制約」参照）。未設定は常に空配列 `[]` で返す（DB上は `null`）。`PATCH .../exercises/:routineExerciseId` は配列を丸ごと置き換える方式（1セットずつの更新APIは無い）。`targetSets: []` を送るとクリアできる |

---

## 5. データモデル（引く章）

正は [schema.prisma](../backend/prisma/schema.prisma)。実装済みは以下の6テーブル。

| テーブル | 役割 | 押さえること |
|---|---|---|
| `users` | ユーザー | `password_hash` にbcryptハッシュを保存。`password_reset_*` カラムはあるが**API未実装**（§2-1） |
| `exercises` | 種目マスタ | `created_by` が **null なら公式種目**、値が入っていればその人のカスタム種目。`default_sort_order` は全件null運用。7部位を網羅する公式種目（計28件）を `backend/prisma/seed.ts` で投入済み（`npm run prisma:seed`。複数回実行しても重複しない） |
| `workouts` | 1日1回分のトレーニング | **`deleted_at` を持つ唯一のテーブル**（ソフトデリート） |
| `workout_sets` | セット1件（重量・回数） | `weight_kg` は **nullable = 自重種目**。`set_order` はサーバー採番 |
| `routines` | 「胸の日」等のテンプレート | 物理削除 |
| `routine_exercises` | ルーティンに入っている種目と並び順 | `target_sets`（jsonb、nullable）に目安セット（重量・回数の配列）を持てる。未設定は`null`（APIレスポンスでは`[]`に正規化。§4-2参照） |

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
