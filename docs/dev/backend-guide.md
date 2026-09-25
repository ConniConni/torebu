# バックエンドの歩き方

対象読者: このプロジェクトのコードを初めて読む人。Express・Prisma・TypeScriptの経験は問わない。

全体構成は [`architecture.md`](./architecture.md) を先に見ておくと理解しやすい。

> **このガイドを他の機能にも拡張するときの型(メモ)**：「具体例」の節は①まず動かしてみる(curlで実際にリクエストを送り、レスポンス・エラーを自分の目で見る) → ②コードを実行順に追う(送った値が関数の中でどう変わるかを具体的な値でトレースする) → ③自分で壊して確かめる(コードを一時的に変えて挙動が変わることを確認する)、という順で書く。**書いたら必ず実際にcurlで動かして検証してから確定させる**([frontend-guide.md](./frontend-guide.md)は当初この検証をせず、実態と異なる記述が後から見つかった。対象機能の棚卸しは[`docs/backlog.md`](../backlog.md)「開発者向けガイド(docs/dev/)の対象機能拡張」参照)。

## ディレクトリの役割

```
backend/src/
  index.ts        -- アプリのエントリーポイント。ミドルウェア・ルーターの登録
  session.ts       -- セッション(ログイン状態)の仕組み
  prisma.ts        -- Prisma Client(DBへのアクセス口)のインスタンス
  middleware/       -- 全ルート共通の前処理(認証チェックなど)
  routes/           -- 機能ごとのAPIエンドポイント(1ファイル1リソース)
  lib/              -- 個別の機能に属さない共通処理(日付計算など)
  generated/prisma/ -- `prisma/schema.prisma`から自動生成されるコード。手で編集しない
```

「1つのAPIリクエストがどう処理されるか」を知りたいときは、まず`routes/`の該当ファイルを読むのが一番早い。

## 具体例：ワークアウト記録を1件作るとき

トレ部の中心機能である「ワークアウトの記録」を例に、リクエストがどう処理されるかを追う。対応するエンドポイントは[`backend/src/routes/workouts.ts`](../../backend/src/routes/workouts.ts)のPOST `/workouts`。

### 1. まず動かしてみる

`backend`を`npm run dev`で起動した状態で、実際にリクエストを送ってみる。ログインが必要なので、`curl`のCookie jar機能(`-c`でCookieをファイルに保存、`-b`でそのファイルを読み込む)を使ってブラウザ無しで完結させる。

まだアカウントが無ければ先に作成する(既にフロントの`/register`から作成済みならこのステップは飛ばしてよい)。

```bash
# アカウント作成(既にある場合はスキップ)
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","displayName":"テスト太郎","birthYearMonth":"no_answer","gender":"no_answer","occupation":"no_answer"}'

# ログインしてCookieを cookie.txt に保存する
curl -c cookie.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

これでカレントディレクトリに`cookie.txt`ができ、以降はこれを`-b cookie.txt`で読み込めばログイン状態でリクエストできる。

```bash
curl -i -X POST http://localhost:3001/workouts \
  -H "Content-Type: application/json" \
  -b cookie.txt \
  -d '{"performedAt": "2024-01-15"}'
```

成功すると、こう返ってくるはずだ。

```json
HTTP/1.1 201 Created
{"id":"...","performedAt":"2024-01-15","memo":null,"hasSets":false,"createdAt":"...","updatedAt":"..."}
```

ここで2つ試してほしい。

- **`-b cookie.txt`を外して送る** → `401 {"error":"unauthenticated"}`が返るはず。「ログインしていないと弾かれる」がコードのどこで起きているか、これから読む
- **`performedAt`を`"not-a-date"`に変える** → `400 {"error":"invalid_request", ...}`が返るはず。日付として解釈できない値は保存される前に弾かれている

この2つの「弾かれ方」が、次のコードのどの行に対応するかを意識しながら読むと、単なる説明の羅列ではなく「さっき見た挙動の正体探し」になる。

### 2. コードを実行順に追う

```ts
const createWorkoutSchema = z.object({
  performedAt: z.coerce.date(),
  memo: z.string().trim().min(1).max(500).optional(),
})

workoutsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createWorkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: z.treeifyError(parsed.error) })
    return
  }
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  const workout = await prisma.workout.create({
    data: { userId, performedAt: parsed.data.performedAt, memo: parsed.data.memo },
  })

  res.status(201).json(serializeWorkout(workout, false))
})
```

さっき`curl`で送った`{"performedAt": "2024-01-15"}`が、この関数の中でどう変わっていくかを追う。

| ステップ | 何が起きるか | このときの値 |
|---|---|---|
| ① `requireAuth`(このハンドラーより先に実行) | `req.session.userId`が無ければここで401を返して終了。Cookieを外したときに弾かれたのはここ | - |
| ② `createWorkoutSchema.safeParse(req.body)` | `req.body`(`{"performedAt": "2024-01-15"}`)を検証。`z.coerce.date()`は「文字列で来てもDate型として扱う」という意味(`coerce`=強制変換) | `parsed.data.performedAt`は`Date`オブジェクト |
| ③ `if (!parsed.success)` | 検証が失敗していれば(`"not-a-date"`を送ったときはここ)400を返して終了。`z.treeifyError()`はzodのエラー内容を「どのフィールドで何が問題か」がわかるオブジェクトに整形するヘルパー | - |
| ④ `req.session.userId!` | 末尾の`!`はTypeScriptの記法(non-null assertion)で、「本当は`undefined`かもしれない型だが、ここでは絶対に値がある」とコンパイラに伝えるもの。①(`requireAuth`)を通過済みなので実際に値があると言い切れる | 例: `"usr_abc123"` |
| ⑤ `prisma.workout.create(...)` | ここで初めてDBにINSERTが発行される | 新しい`workout`行(idが採番される) |
| ⑥ `serializeWorkout(workout, false)` | DBの行をレスポンス用の形に変換 | `curl`で見たJSONと同じ形 |

①〜③が「弾く」処理、④〜⑥が「実際に保存する」処理、という2段構成になっている。多くのAPIエンドポイントはこの「弾く→本処理」の型を繰り返すので、一度この型を掴むと他のエンドポイント(`routines.ts`や`groups.ts`)も同じ枠組みで読める。

ここで押さえるポイント：

- **`requireAuth`は第2引数** — Expressのルート定義は `router.post(パス, ミドルウェア..., ハンドラー)` の形。`requireAuth`が先に実行され、未ログインならここで401を返して終わる(次項で詳しく説明)
- **返す前に`serializeWorkout()`で整形** — Prismaが返すDBの行(モデル)をそのまま返さず、フロントが必要とする形に変換してから返す。パスワードハッシュなど余計な情報を漏らさないためでもある

### 3. 自分で壊して確かめる

理解の確認に、以下を実際にやってみてほしい。

- `requireAuth`を一時的にこのルートから外して保存する(`tsx watch`が自動で再起動するので手動操作は不要)。その状態で`-b cookie.txt`を外してcurlを送るとどうなるか（→ `userId`が`undefined`になり、`prisma.workout.create`が失敗するはず。なぜ`requireAuth`が必要か体感できる）
- `memo`に501文字の文字列を送るとどうなるか（→ `z.string().max(500)`に引っかかって400になるはず）

試したら元に戻すこと。この「意図的に壊して直す」作業が、次に自分でAPIを追加するときの土台になる。

### 4. `requireAuth`ミドルウェアで認証チェック

[`backend/src/middleware/requireAuth.ts`](../../backend/src/middleware/requireAuth.ts)

```ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  next()
}
```

`req.session`は[`session.ts`](../../backend/src/session.ts)で設定される`express-session`のミドルウェアが、リクエストのCookie(`sid`)を元にPostgreSQLの`session`テーブルから復元してくれる。ログイン時に`req.session.userId = user.id`のような形で保存された値がここで読み出せる(ログイン処理は`routes/auth.ts`参照)。

`next()`を呼ばなければ後続のハンドラーは実行されない。これがExpressの「ミドルウェアチェーン」の基本形。

### 5. Prisma経由でDBに保存

`prisma.workout.create({ data: {...} })`が実際にSQLの`INSERT`を発行する部分。Prismaは「ORM(Object-Relational Mapper)」と呼ばれる種類のライブラリで、SQLを直接書く代わりにJavaScriptのオブジェクト操作としてDB操作を書ける。

- テーブル定義は[`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma)にある
- `prisma.workout`の`workout`はこのスキーマの`model Workout`に対応する
- 型(`WorkoutModel`など)は`schema.prisma`から自動生成される([`generated/prisma/`](../../backend/src/generated/prisma/))。スキーマを変更したら`npx prisma migrate dev`でマイグレーションと型生成を行う

## この例から読み取れる設計上の判断

- **認可はミドルウェアで一元化** — `requireAuth`を各ルートに差し込む形にすることで、「ログイン必須かどうか」がルート定義を見るだけでわかる
- **自分のデータしか触れない** — `workouts.ts`には`findOwnWorkout()`のような「自分の(かつ削除されていない)workoutのみ返す」ヘルパーがある。他人のIDを指定してアクセスされても404を返す(IDOR対策)。コード中のコメントに理由が書かれているので、認可まわりを読むときはコメントも合わせて読むとよい
- **バリデーションはzodスキーマに集約** — `createWorkoutSchema`のように、リクエストの形をスキーマとして定義してから検証する。手書きのif文チェックより漏れが出にくい

## 次に読むと理解が深まるファイル

- `backend/src/routes/auth.ts` — ログイン・ログアウト・セッション確立の流れ
- `backend/src/routes/workouts.ts`の`shareActiveGroup()` — グループ機能の「誰が誰の記録を見られるか」の判定ロジック
- `docs/schema.md` — テーブル設計の背景・なぜセッション方式を選んだか
