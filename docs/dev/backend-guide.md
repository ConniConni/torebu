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

## 具体例1：ワークアウト記録を1件作るとき

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

## 具体例1から読み取れる設計上の判断

- **認可はミドルウェアで一元化** — `requireAuth`を各ルートに差し込む形にすることで、「ログイン必須かどうか」がルート定義を見るだけでわかる
- **自分のデータしか触れない** — `workouts.ts`には`findOwnWorkout()`のような「自分の(かつ削除されていない)workoutのみ返す」ヘルパーがある。他人のIDを指定してアクセスされても404を返す(IDOR対策)。コード中のコメントに理由が書かれているので、認可まわりを読むときはコメントも合わせて読むとよい
- **バリデーションはzodスキーマに集約** — `createWorkoutSchema`のように、リクエストの形をスキーマとして定義してから検証する。手書きのif文チェックより漏れが出にくい

## 具体例2：ログインしてセッションを確立するとき

もう1つの例として、[`backend/src/routes/auth.ts`](../../backend/src/routes/auth.ts)のPOST `/auth/login`を追う。「1で見た`requireAuth`が読み出している`req.session.userId`は、そもそもどこで作られるのか」がここでわかる。全体の流れ図は[architecture.md](./architecture.md)の認証フロー図も参照。

### 1. まず動かしてみる

`backend`を`npm run dev`で起動した状態で試す。アカウントが無ければ具体例1の手順で`test@example.com`を作成しておく。

```bash
# わざと間違ったパスワードで送る
curl -i -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong-password"}'
```

```json
HTTP/1.1 401 Unauthorized
{"error":"invalid_credentials"}
```

正しいパスワードで送ると`-c cookie.txt`でCookieが保存され、以降のリクエストで使える(具体例1で使ったものと同じ`cookie.txt`)。

```bash
curl -i -c cookie.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

```json
HTTP/1.1 200 OK
{"id":"...","email":"test@example.com","displayName":"テスト太郎","gender":"no_answer"}
```

ここで2つ試してほしい。

- **存在しないメールアドレスで送る** → `{"email":"not-registered@example.com", ...}` にすると、`user`が見つからないパターンのはずだが、**パスワードを間違えたときと同じ`401 {"error":"invalid_credentials"}`が返る**。「メールアドレスが存在しない」と「パスワードが違う」を区別せずに同じエラーにしているのは意図的。理由をこれから読む
- **ログイン成功後に`-b cookie.txt`を付けて`/auth/me`を叩く** → `curl -b cookie.txt http://localhost:3001/auth/me` で`200`とユーザー情報が返る。`-b`を外すと`401 {"error":"unauthenticated"}`になる(具体例1の`requireAuth`と同じ仕組み)

### 2. コードを実行順に追う

```ts
authRouter.post('/login', loginRateLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) { /* 400 */ }
  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })

  const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH
  const passwordMatches = await bcrypt.compare(password, passwordHash)

  if (!user || !passwordMatches) {
    res.status(401).json({ error: 'invalid_credentials' })
    return
  }

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
  req.session.userId = user.id

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

  res.status(200).json({ id: user.id, email: user.email, displayName: user.displayName, gender: user.gender })
})
```

| ステップ | 何が起きるか |
|---|---|
| ① `loginRateLimiter`(第2引数のミドルウェア) | 同一IPからの試行回数を数える。15分間に10回を超えると`429`になる(総当たり攻撃対策)。テスト実行時だけ無効化される |
| ② `prisma.user.findUnique({ where: { email } })` | メールアドレスに一致するユーザーを探す。存在しなければ`user`は`null` |
| ③ `bcrypt.compare(password, passwordHash)` | `user`が`null`のときも`DUMMY_PASSWORD_HASH`との比較を必ず行う。これが無いと、「ユーザーが存在しない場合は`bcrypt.compare`をスキップして即401を返す」実装になり、存在しない場合の方がレスポンスが速くなる。その時間差でメールアドレスの実在を推測されてしまう(タイミング攻撃)。だから存在しない場合も同じだけ計算コストをかけている |
| ④ `if (!user \|\| !passwordMatches)` | 「ユーザーがいない」場合と「パスワードが違う」場合を**同じ401 `invalid_credentials`**にまとめている。別のエラーコードにすると「そのメールアドレスは登録されているか」を外部から探れてしまう(メールアドレス列挙対策)。さっきcurlで確認した挙動はここ |
| ⑤ `req.session.regenerate(...)` | ここで新しいセッションID(`sid`)を発行し直す。ログイン前のセッションIDをそのまま使い回さない。次の「自分で壊して確かめる」で詳しく扱う |
| ⑥ `req.session.userId = user.id` | 新しいセッションに`userId`を保存する。以降のリクエストで`requireAuth`が読むのはこの値(具体例1参照) |
| ⑦ `res.status(200).json({...})` | パスワードハッシュ等を含めず、フロントに必要な情報だけ返す |

`req.session`への代入(⑥)は、レスポンスを返す際に`session.ts`の`sessionMiddleware`が検知して、PostgreSQLの`session`テーブルへの保存と`Set-Cookie`ヘッダーの送出を自動で行う。ここでは明示的に「DBに保存する」コードを書いていない点に注意(`workouts.ts`の`prisma.workout.create`のような明示的な保存呼び出しがない)。

### 3. 自分で壊して確かめる

- `if (!user || !passwordMatches)`を一時的に`if (!user)`に変えて保存する(`tsx watch`が自動再起動)。そのうえで、登録済みのメールアドレスに**わざと間違ったパスワード**を送ると、`200`でログインが成功してしまうはずだ。これが本来`!passwordMatches`が防いでいるもの。**試したら必ず元に戻すこと**(このチェックを外したまま動かし続けるのは、他人のメールアドレスが分かればログインできてしまう深刻な欠陥になる)
- `req.session.regenerate(...)`のブロックを一時的にコメントアウトして`req.session.userId = user.id`だけ残すとどうなるか考えてみる。curlの`-c cookie.txt`だけでは挙動の違いが見た目にはわかりにくいが、コードのコメントにある通り、これは「ログイン前に外部から仕込まれたセッションIDを、ログイン後もそのまま使い続けてしまう」問題(セッション固定化)への対策。攻撃者が被害者に特定の`sid`を踏ませておき、被害者がそのセッションでログインした後も同じ`sid`が有効なままだと、攻撃者はそのIDでログイン後のセッションに便乗できてしまう。`regenerate()`はログインの瞬間に必ず新しい`sid`を発行することでこれを防いでいる

## 具体例2から読み取れる設計上の判断

- **列挙対策は「同じ結果を返す」ことで実現する** — 「ユーザーが存在しない」と「パスワードが違う」を別のエラーにしない、存在しない場合もダミーハッシュとの比較で処理時間を揃える、という2つの工夫で、外部から「そのメールアドレスが登録済みかどうか」を探れないようにしている
- **ログイン成功時にセッションIDを再生成する** — `req.session.userId = ...`の前に必ず`req.session.regenerate()`を呼び、ログイン前後でセッションIDを変える。これを省略すると、ログイン前に外部から仕込まれたセッションIDがログイン後もそのまま有効になってしまう(セッション固定化)

## 具体例3：グループの権限を判定するとき

もう1つの例として、[`backend/src/routes/groups.ts`](../../backend/src/routes/groups.ts)のGET `/groups/:id`・DELETE `/groups/:id`を追う。「所属していない人からは404で隠す」「所属していてもオーナーでなければ403」という、2段階の認可判定がどう書かれているかを見る。

### 1. まず動かしてみる

具体例1で作った`test@example.com`(A、以下Aと呼ぶ)に加えて、もう2アカウント作る。

```bash
# B・Cを作成し、それぞれのCookieを別ファイルに保存してログインしておく
curl -c cookieB.txt -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test-b@example.com","password":"password123","displayName":"けんしょうB","birthYearMonth":"no_answer","gender":"no_answer","occupation":"no_answer"}'
curl -c cookieB.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test-b@example.com","password":"password123"}'

curl -c cookieC.txt -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test-c@example.com","password":"password123","displayName":"けんしょうC","birthYearMonth":"no_answer","gender":"no_answer","occupation":"no_answer"}'
curl -c cookieC.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test-c@example.com","password":"password123"}'
```

Aでグループを作り(Aがオーナーになる)、招待コードでBだけを参加させる。Cはどちらにも参加させない。

```bash
# Aでグループ作成(cookie.txtは具体例1・2で作ったAのログイン済みCookie)。レスポンスのidとinviteCodeを控える
curl -X POST http://localhost:3001/groups \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"name":"権限検証グループ"}'
# => {"id":"<groupId>","inviteCode":"<code>", ..., "role":"owner"}

# Bが招待コードで参加する
curl -X POST http://localhost:3001/groups/join \
  -H "Content-Type: application/json" -b cookieB.txt \
  -d '{"inviteCode":"<code>"}'
```

ここで3パターン試してほしい(`<groupId>`は実際のIDに置き換える)。

- **Cで(未所属のまま)グループ詳細を取得する** → `curl -b cookieC.txt http://localhost:3001/groups/<groupId>` は`404 {"error":"not_found"}`。DELETEも同様に`curl -X DELETE -b cookieC.txt http://localhost:3001/groups/<groupId>`で`404`になる。「存在するかどうかさえ教えない」形
- **Bで(所属しているがオーナーではない)グループを削除する** → `curl -X DELETE -b cookieB.txt http://localhost:3001/groups/<groupId>`は`403 {"error":"forbidden"}`。存在は認めた上で「権限が無い」と明確に伝えている
- **Aで(オーナー)グループを削除する** → `curl -X DELETE -b cookie.txt http://localhost:3001/groups/<groupId>`は`204`で成功する

同じ「入れない」結果でも、Cには404(存在自体を隠す)、Bには403(存在は認めるが権限が無い)と、使い分けているのがポイント。次はこれがコードのどこで起きているかを追う。

### 2. コードを実行順に追う

```ts
// 退会済み(leftAt有り)は対象外。アクティブなメンバーシップのみを「所属」として扱う
async function findActiveMembership(userId: string, groupId: string) {
  return prisma.groupMember.findFirst({
    where: { userId, groupId, leftAt: null, group: { deletedAt: null } },
  })
}

groupsRouter.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId!
  const groupId = req.params.id as string

  const membership = await findActiveMembership(userId, groupId)
  if (!membership) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  if (membership.role !== 'owner') {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  await prisma.group.update({ where: { id: groupId }, data: { deletedAt: new Date() } })
  res.status(204).send()
})
```

| ステップ | 何が起きるか | Cで試したとき | Bで試したとき |
|---|---|---|---|
| ① `findActiveMembership(userId, groupId)` | そのユーザーがこのグループのアクティブなメンバーかどうかを1回のクエリで見る | `membership`は`null`(所属していない) | `membership`は`{ role: 'member', ... }` |
| ② `if (!membership)` | 所属していなければここで404。「存在しない」と「所属していない」を区別せず同じ404にすることで、未所属者にグループの存在自体を教えない(IDOR対策。具体例1の`findOwnWorkout`と同じ考え方) | ここで打ち切り。以降のコードには進まない | 通過(`membership`があるため) |
| ③ `if (membership.role !== 'owner')` | 所属はしているが`role`が`'owner'`でなければ403。ここは「存在は認めた上で権限を伝える」ので404とは違うステータスを使う | (到達しない) | ここで打ち切り |
| ④ `prisma.group.update({ data: { deletedAt: ... } })` | ソフトデリート。Aだけがここまで到達する | - | - |

GET `/groups/:id`(具体例3の1で最初に試した取得の方)も①②は全く同じ形で、③の代わりに詳細データを組み立てて返す。「所属チェックで404 → 必要なら追加のロール確認で403」という2段構成は、`groups.ts`の他のエンドポイント(招待コード再発行・退会など)にも繰り返し出てくる。

### 3. 自分で壊して確かめる

- `if (membership.role !== 'owner')`のブロックを一時的にコメントアウトして保存する(`tsx watch`が自動再起動)。その状態でBの`cookieB.txt`を使ってグループを削除するcurlを送ると、本来403になるはずが`204`で消えてしまうはずだ。メンバーなら誰でもグループを削除できてしまう、という深刻な権限不備が起きる。**試したら必ず元に戻すこと**
- `findActiveMembership`の`where`から`leftAt: null`を一時的に外してみる。退会済み(`leftAt`が入っている)のメンバーでも所属者として扱われるようになり、退会したはずの人がグループ詳細を見たり削除したりできてしまう。これが「アクティブなメンバーのみ」という条件を明示している理由

## 具体例3から読み取れる設計上の判断

- **「存在を隠す404」と「権限不足を伝える403」を使い分ける** — 未所属者にはグループの存在自体を教えない(404)一方、所属しているメンバーには「権限が無い」ことを403で明確に伝える。どちらも`findActiveMembership()`という同じ関数の結果から2段階で判定している
- **判定関数は「何に対する権限か」で使い分ける** — `groups.ts`の`findActiveMembership()`は「このグループの操作(詳細取得・削除など)ができるか」を1グループ単位で見る。一方、具体例1の`findOwnWorkout()`と同じ並びで`workouts.ts`にある`shareActiveGroup()`は「いずれかのグループで同席しているか」を見るもので、他人のworkoutへのいいね・コメント(投稿・一覧取得)の対象範囲に使われる(`findAccessibleWorkout()`経由。グループを横断する判定)。どちらも「所属していないメンバーの情報には触れない」という同じ方針だが、対象がグループ自体かworkoutかで判定の単位が違う

## 具体例4：ルーティンに目安セットを追加するとき

もう1つの例として、[`backend/src/routes/routines.ts`](../../backend/src/routes/routines.ts)のPOST `/routines/:id/exercises`・PATCH `/routines/:id/exercises/:routineExerciseId`を追う。「ルーティン」は、種目ごとに「目安セット(重量・回数)」をあらかじめ登録しておき、記録作成時に一括で呼び出せる機能。[frontend-guide.md](./frontend-guide.md)具体例4で見るように、ルーティン編集画面で種目を追加すると、目安セット1件が具体例1と同じ「選んだ瞬間にデフォルト値で保存される」形で即登録される。

### 1. まず動かしてみる

`backend`を`npm run dev`で起動した状態で試す。アカウントが無ければ具体例1の手順で`test@example.com`を作成しログインしておく(`cookie.txt`を使う)。

```bash
# ルーティンを作る
curl -s -X POST http://localhost:3001/routines \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"name":"胸の日"}'
# => {"id":"<routineId>", "name":"胸の日", ...}

# 種目一覧を取得し、レスポンスの中から"name":"ベンチプレス"の行のidを控える(公式種目なので誰でも使える)
curl -s -b cookie.txt http://localhost:3001/exercises
```

種目を(まだ目安セット無しで)ルーティンに追加する。

```bash
curl -i -X POST http://localhost:3001/routines/<routineId>/exercises \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<exerciseId>","sortOrder":1}'
```

```json
HTTP/1.1 201 Created
{"id":"<routineExerciseId>","routineId":"<routineId>","exerciseId":"<exerciseId>","sortOrder":1,"targetSets":[]}
```

目安セットを1件設定する(PATCH。配列をまるごと送る)。

```bash
curl -i -X PATCH http://localhost:3001/routines/<routineId>/exercises/<routineExerciseId> \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"targetSets":[{"weightKg":60,"reps":8}]}'
```

```json
HTTP/1.1 200 OK
{"id":"<routineExerciseId>", ..., "targetSets":[{"weightKg":60,"reps":8}]}
```

ここで2つ試してほしい。

- **空のPATCH(`{}`)を送る** → `400 {"error":"invalid_request","details":{"errors":["sortOrder・targetSetsのいずれかを指定してください"]}}`。「何も変更しないPATCH」を弾く仕組みがある
- **`weightKg`を`60.3`(0.5kg刻みでない値)にして送る** → `400`で`weightKg`の`errors`に「重量は0.5kg刻みで入力してください」が入る。ワークアウト記録の重量チェックと同じ基準(`workouts.ts`で定義された`weightKgSchema`)を`routines.ts`が`import`して使い回しているため、同じ基準がここでも効いている

### 2. コードを実行順に追う

```ts
const addExerciseSchema = z.object({
  exerciseId: z.string().uuid(),
  sortOrder: z.number().int().positive(),
  targetSets: targetSetsSchema.optional(), // 省略時は目安セット無し(null)
})

routinesRouter.post('/:id/exercises', requireAuth, async (req, res) => {
  const parsed = addExerciseSchema.safeParse(req.body)
  if (!parsed.success) { /* 400 */ }
  const userId = req.session.userId!
  const routine = await findOwnRoutine(userId, req.params.id as string)
  if (!routine) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const visible = await isExerciseVisible(userId, parsed.data.exerciseId)
  if (!visible) {
    res.status(400).json({ error: 'invalid_exercise' })
    return
  }

  const routineExercise = await prisma.routineExercise.create({
    data: { routineId: routine.id, exerciseId: parsed.data.exerciseId, sortOrder: parsed.data.sortOrder, targetSets: parsed.data.targetSets },
  })

  res.status(201).json(serializeRoutineExercise(routineExercise))
})
```

| ステップ | 何が起きるか |
|---|---|
| ① `addExerciseSchema.safeParse(req.body)` | `exerciseId`(UUID)・`sortOrder`(正の整数)を検証。`targetSets`は`.optional()`なので、具体例1のcurlのように省略すれば`undefined`のまま次に進む |
| ② `findOwnRoutine(userId, routineId)` | 具体例1の`findOwnWorkout()`・具体例3の`findActiveMembership()`と同じ形の「自分のものか」チェック。他人のroutineなら404(IDOR対策)。`routines.ts`のコード中コメントにある通り、routineには`deletedAt`が無く物理削除なので、`findOwnRoutine`は`userId`一致だけを見ればよい(`docs/schema.md`参照) |
| ③ `isExerciseVisible(userId, exerciseId)` | `GET /exercises`と同じ基準(公式種目 or 自分のカスタム種目、かつ削除されていない)で、そのexerciseIdがこのユーザーから見えるものかを確認する。他人専用のカスタム種目・削除済みのカスタム種目を指定すると、ここで`400 invalid_exercise`になる |
| ④ `prisma.routineExercise.create(...)` | `targetSets`が`undefined`なら、Prismaはこれを「そのカラムを指定しない」として扱い、DB側のデフォルト(`null`)が入る。レスポンスの`targetSets`が`[]`なのは、`serializeRoutineExercise()`が`null`を`[]`に変換しているため(28-36行目付近) |

続いてPATCH側。

```ts
const updateRoutineExerciseSchema = z
  .object({
    sortOrder: z.number().int().positive().optional(),
    targetSets: targetSetsSchema.optional(),
  })
  .refine((data) => data.sortOrder !== undefined || data.targetSets !== undefined, {
    message: 'sortOrder・targetSetsのいずれかを指定してください',
  })
```

`.refine()`はzodで「複数フィールドにまたがる条件」を書くための仕組み。`sortOrder`・`targetSets`のどちらも`undefined`(＝空のPATCH)だった場合にだけ、指定したメッセージ付きでバリデーションエラーにする。空のcurlを送ったときの400はここで発生している。

`targetSets`自体の検証は、ファイル先頭の`targetSetSchema`(10-17行目)が担う。

```ts
const targetSetSchema = z.object({
  weightKg: weightKgSchema.nullable().optional(), // null/省略 = 自重
  reps: repsSchema,
})
const targetSetsSchema = z.array(targetSetSchema).max(20)
```

`weightKgSchema`・`repsSchema`は`workouts.ts`からimportしたもの(5行目)で、`workout_sets`の重量・回数と全く同じ基準(0.5kg刻み・999.5kg以下、正の整数・999以下)を使い回している。`weightKg`に`60.3`を送ると`400`になったのは、`workouts.ts`側で定義された`.refine((value) => Math.round(value * 2) === value * 2, ...)`がそのまま効いているため。

### 3. 自分で壊して確かめる

- `updateRoutineExerciseSchema`の`.refine(...)`のブロックを一時的にコメントアウトして保存する(`tsx watch`が自動再起動)。その状態で空のPATCH(`{}`)を送ると、`200`で成功してしまうはずだ(実際には何もフィールドを更新しないPrismaの`update({data: {}})`が呼ばれ、変化しないレコードがそのまま返る)。「意味の無いリクエストを弾く」ためだけに見えるこの1行が無いと、フロント側の書き間違い(例えば`saveTargetSets`の呼び出し漏れ)にサーバー側で気づけなくなる。**試したら必ず元に戻すこと**
- `isExerciseVisible`の呼び出しをコメントアウトして保存し、他アカウントの非公開カスタム種目のIDを指定してPOSTしてみる → 本来`400 invalid_exercise`になるはずが`201`で追加できてしまう。他人のカスタム種目を自分のルーティンに紐付けられてしまう、という設計上望ましくない状態が体感できる。**試したら必ず元に戻すこと**

## 具体例4から読み取れる設計上の判断

- **配列カラムはまるごと置き換える設計にしている** — `targetSets`は`jsonb`カラムに配列としてそのまま保存され、PATCHのたびに配列全体を送り直す。`workout_sets`のような「1セットごとに個別のPATCH/DELETEエンドポイントを持つ」設計とは違う(コード中のコメント参照)。1ルーティンあたりの目安セット数が`.max(20)`で小さく抑えられているため、まるごと送っても実用上問題にならないという判断
- **「何も変更しないリクエスト」を`.refine()`で弾く** — 空のPATCHをサーバー側で明示的にエラーにすることで、フロント側の実装ミス(更新対象を渡し忘れる等)に気づきやすくしている。具体例1・3のようなIDOR対策の404/403とは違う種類の「壊れたリクエストを弾く」設計判断
- **バリデーションスキーマを機能をまたいで再利用する** — `weightKgSchema`・`repsSchema`を`workouts.ts`からexportして`routines.ts`がimportする形にすることで、「重量・回数として妥当な値」の基準を1箇所にまとめている。目安セットと実際のワークアウトのセットで基準がズレる心配がない

## 具体例5：統計データを集計するとき

もう1つの例として、[`backend/src/routes/stats.ts`](../../backend/src/routes/stats.ts)のGET `/stats/volume`・GET `/stats/exercises/:exerciseId/history`を追う。ここまでの具体例は「弾く(401/404/403/400)か、通すか」の判定が中心だったが、この機能は全件走査してJavaScript側で集計する処理が中心になる。加えて、「集計対象を意図的に絞り込む」という、IDOR対策やバリデーションとは種類の違う設計判断が2つ入っている。

### 1. まず動かしてみる

`backend`を`npm run dev`で起動した状態で試す。アカウントが無ければ具体例1の手順で`test@example.com`を作成しログインしておく(`cookie.txt`を使う)。

まず、ワークアウトを1件作り、公式種目(ベンチプレス)のセットを2つ追加する。`<benchId>`は`curl -b cookie.txt http://localhost:3001/exercises`のレスポンスから`"name":"ベンチプレス"`の`id`を控える。

```bash
curl -s -X POST http://localhost:3001/workouts \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"performedAt": "2024-01-15"}'
# => {"id":"<workoutId>", ...}

curl -s -X POST http://localhost:3001/workouts/<workoutId>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<benchId>","weightKg":60,"reps":8}'
curl -s -X POST http://localhost:3001/workouts/<workoutId>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<benchId>","weightKg":65,"reps":5}'
```

続けて、**自重種目(プッシュアップ)のセット(`weightKg`を指定しない)**と、**自分のカスタム種目**を1つ作ってそのセットも追加する。`<pushupId>`は先ほどと同じ`GET /exercises`のレスポンスから`"name":"プッシュアップ(腕立て伏せ)"`の`id`を控える。

```bash
curl -s -X POST http://localhost:3001/workouts/<workoutId>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<pushupId>","reps":20}'

# カスタム種目を作る
curl -s -X POST http://localhost:3001/exercises \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"name":"検証用カスタム種目","muscleGroup":"chest"}'
# => {"id":"<customId>", ...}

curl -s -X POST http://localhost:3001/workouts/<workoutId>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d "{\"exerciseId\":\"<customId>\",\"weightKg\":100,\"reps\":3}"
```

ここで日別の合計負荷重量を取得する。

```bash
curl -s -b cookie.txt "http://localhost:3001/stats/volume?range=3m"
```

```json
[{"date":"2024-01-15","volumeKg":805}]
```

`805`は`60kg×8回 + 65kg×5回 = 480 + 325 = 805`。**自重セット(プッシュアップ)もカスタム種目(100kg×3回=300)もこの合計に含まれていない**ことに注目してほしい。実際にこの2つ(合わせて300kg分)を除いた数字がここにあるのが確認できる。

続けて種目別の推移も見る。

```bash
curl -s -b cookie.txt "http://localhost:3001/stats/exercises/<benchId>/history?range=3m"
# => [{"date":"2024-01-15","maxWeightKg":65,"volumeKg":805}]

curl -s -b cookie.txt "http://localhost:3001/stats/exercises/<customId>/history?range=3m"
# => 404 {"error":"not_found"}
```

ベンチプレスの`maxWeightKg`はそのセットのうち最大の`65`。一方、カスタム種目のidを指定すると、データは実在するのに**404**が返る。この「除外」と「404」がコードのどこで起きているかを、次で追う。

### 2. コードを実行順に追う

```ts
// 集計対象は公式種目のみ(createdBy IS NULL)。カスタム種目は記録・ルーティンには使えるが
// 集計の対象外(2026-09-08決定、docs/backlog.md参照)。将来ニーズが出たら再検討する
const OFFICIAL_EXERCISE_FILTER = { createdBy: null }

statsRouter.get('/volume', requireAuth, async (req, res) => {
  const parsed = rangeSchema.safeParse(req.query)
  if (!parsed.success) { /* 400 */ }
  const userId = req.session.userId
  const startDate = rangeStartDate(parsed.data.range)

  const sets = await prisma.workoutSet.findMany({
    where: {
      weightKg: { not: null },
      workout: { userId, deletedAt: null, ...(startDate ? { performedAt: { gte: startDate } } : {}) },
      exercise: OFFICIAL_EXERCISE_FILTER,
    },
    select: { weightKg: true, reps: true, workout: { select: { performedAt: true } } },
  })

  const volumeByDate = new Map<string, number>()
  for (const set of sets) {
    const weightKg = Number(set.weightKg)
    const dateKey = toDateKey(set.workout.performedAt)
    volumeByDate.set(dateKey, (volumeByDate.get(dateKey) ?? 0) + weightKg * set.reps)
  }

  const result = Array.from(volumeByDate.entries())
    .map(([date, volumeKg]) => ({ date, volumeKg }))
    .sort((a, b) => a.date.localeCompare(b.date))

  res.json(result)
})
```

| ステップ | 何が起きるか | このときの値 |
|---|---|---|
| ① `rangeSchema.safeParse(req.query)` | `range`(`1m`/`3m`/`all`)を検証。デフォルトは`3m` | `range: '3m'` |
| ② `rangeStartDate(range)` | `3m`なら「今日の0時から90日前」の`Date`を返す。`all`は`undefined`(下限なし) | `startDate`は約90日前 |
| ③ `prisma.workoutSet.findMany({ where: {...} })` | `weightKg: { not: null }`で自重セットを除外、`exercise: OFFICIAL_EXERCISE_FILTER`でカスタム種目を除外。この2つのwhere条件が、curlで見た「300kg分が含まれない」の正体 | プッシュアップ・カスタム種目のセットは`sets`に入らない |
| ④ `for (const set of sets)` | `Map<日付, 合計>`に`weightKg * reps`を積み上げていく。同じ日付に複数セットがあれば加算される | `volumeByDate.get('2024-01-15')`が`0→480→805`の順に2回更新される(1セット目`60×8=480`、2セット目`+65×5=325`) |
| ⑤ `Array.from(...).sort(...)` | `Map`を配列に変換し、日付の文字列比較(`localeCompare`。`"2024-01-15" < "2024-01-20"`のようにISO形式なら文字列比較がそのまま時系列順になる)で並べ替える | `[{date:"2024-01-15", volumeKg:805}]` |

`workouts.ts`(具体例1)の「1件のリクエストを検証して1件保存する」形と違い、ここは**「条件に合う行を全部取ってきてJS側でMapに集計する」**という別の形。DB側の`GROUP BY`(Prismaの`groupBy`)を使わずJS側で集計しているのは、日付は`workout.performedAt`(別テーブル)にあり、`weightKg * reps`という掛け算をSQL側でやるよりアプリ側でやる方がシンプルだから。

続いて種目別履歴(`/exercises/:exerciseId/history`)。集計ロジックの構造は`/volume`とほぼ同じだが、先頭に1つ判定が増える。

```ts
statsRouter.get('/exercises/:exerciseId/history', requireAuth, async (req, res) => {
  const parsed = rangeSchema.safeParse(req.query)
  if (!parsed.success) { /* 400 */ }
  const userId = req.session.userId
  const exerciseId = req.params.exerciseId as string
  const startDate = rangeStartDate(parsed.data.range)

  // 集計対象は公式種目のみ。カスタム種目・存在しないIDは「存在自体を隠す」方針(§4-1)に合わせ404
  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, ...OFFICIAL_EXERCISE_FILTER },
  })
  if (!exercise) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  // ここから先は/volumeと同じ形でsetsを集計する(weightKgの最大値と合計も取る)
})
```

| ステップ | 何が起きるか |
|---|---|
| ① `prisma.exercise.findFirst({ where: { id: exerciseId, ...OFFICIAL_EXERCISE_FILTER } })` | `exerciseId`が公式種目のものであれば`exercise`が見つかる。カスタム種目のidを渡すと、レコード自体は存在するのに`OFFICIAL_EXERCISE_FILTER`(`createdBy: null`)に合わないため`null`になる |
| ② `if (!exercise)` | ここで404。curlで見たカスタム種目の404はここで発生している。コード中のコメントにある通り、「存在するが集計対象外」と「本当に存在しない(適当なUUID)」を区別せず同じ404にしている点は、具体例1・3で見たIDOR対策の404(「存在を隠す」)と形は同じだが、**理由は別(所属していない他人のデータではなく、そもそも仕様として集計しない種類のデータだから)** |

### 3. 自分で壊して確かめる

- `/volume`の`where`から`exercise: OFFICIAL_EXERCISE_FILTER`を一時的にコメントアウトして保存する(`tsx watch`が自動再起動)。その状態でさっきと同じcurl(`GET /stats/volume?range=3m`)を送ると、`805`だったはずの合計が`1105`(カスタム種目の`100kg×3回=300`が足された値)になる。「公式種目のみ集計する」という1行のwhere条件が、実際に何kg分の差を生んでいるかが数字で確認できる。**試したら必ず元に戻すこと**
- `/exercises/:exerciseId/history`の`where`から`...OFFICIAL_EXERCISE_FILTER`を一時的に外して`{ id: exerciseId }`だけにして保存する。その状態でカスタム種目のidを指定してcurlを送ると、本来`404`のはずが`200`で`[{"date":"2024-01-15","maxWeightKg":100,"volumeKg":300}]`のようなデータが返ってきてしまう。「集計対象外」という仕様がAPIレベルで漏れると何が起きるかが体感できる。**試したら必ず元に戻すこと**

## 具体例5から読み取れる設計上の判断

- **集計は「範囲を絞ってfindMany→JS側でMapに積み上げる」形で書く** — 具体例1〜4の「1件を検証して1件保存/更新する」形とは違い、複数行を取得してから`Map`でグループ化する。SQL側の`GROUP BY`を使わないのは、日付(別テーブル)をキーにした計算がJS側の方が素直に書けるため
- **「集計しない」を明示的なwhere条件にする** — 自重セット(`weightKg: null`)・カスタム種目(`createdBy`が`null`でない)という2種類の「対象外」を、`weightKg: { not: null }`・`OFFICIAL_EXERCISE_FILTER`という条件としてコードに残している。これらはバリデーションエラーでもIDOR対策でもなく、「何を数えるかの仕様そのもの」をコードに落とし込んだもの。`docs/backlog.md`に決定の経緯が残っている(2026-09-08決定)
- **「対象外」と「本当に存在しない」を区別しない404もある** — 具体例3の404(未所属者にグループの存在を隠す)と形は同じでも、こちらの理由は「他人のデータへのアクセス防止」ではなく「そもそも集計仕様の対象外」。同じステータスコードでも、コードごとに404を選んだ理由は違うことがある

## 具体例6：通知の表示を5分遅らせ、表示時に条件を再確認するとき

もう1つの例として、[`backend/src/routes/notifications.ts`](../../backend/src/routes/notifications.ts)の`findVisibleNotifications()`を追う。ここまでの具体例は「保存した瞬間の状態で弾くか通すか(401/403/404)を判定する」形だったが、この機能は**保存はその場で行うが、表示するかどうかは後から(しかも2回)判定する**という別の形をしている。題材は新メンバー参加(`member_joined`)通知。対応するのは`backend/src/routes/groups.ts`のPOST `/groups/join`(具体例3で読んだ`shareActiveGroup`と同じファイル)。

### 1. まず動かしてみる

`backend`を`npm run dev`で起動した状態で試す。2つのアカウント(オーナーA・ジョイナーB)を具体例1の手順で作り、それぞれの`cookie.txt`を`owner.cookie`・`joiner.cookie`のように分けて保存しておく。

オーナーAがグループを作る。

```bash
curl -s -b owner.cookie -X POST http://localhost:3001/groups \
  -H "Content-Type: application/json" -d '{"name":"検証用グループ"}'
# => {"id":"<groupId>", "inviteCode":"<inviteCode>", ...}
```

ジョイナーBが招待コードで参加する。

```bash
curl -s -b joiner.cookie -X POST http://localhost:3001/groups/join \
  -H "Content-Type: application/json" -d '{"inviteCode":"<inviteCode>"}'
```

参加した**直後**に、オーナーAが通知一覧を見る。

```bash
curl -s -b owner.cookie http://localhost:3001/notifications
# => []
curl -s -b owner.cookie http://localhost:3001/notifications/unread-count
# => {"count":0}
```

`member_joined`通知は実際には保存されているのに、一覧にも未読件数にも**何も出てこない**(実際に検証すると`[]`・`{"count":0}`が返る)。5分待つ(または後述のようにDBの`createdAt`を書き換える)と、同じリクエストで通知が現れる。

```json
[{"id":"...","type":"member_joined","isRead":false,"createdAt":"...",
  "actor":{"id":"...","displayName":"ジョイナーB"},
  "target":{"type":"group","groupId":"<groupId>","groupName":"検証用グループ"}}]
```

「保存はされているのに、しばらく一覧に出てこない」という、これまでの具体例には無かった時間差がどこで起きているかを、次でコードから確認する。

### 2. コードを実行順に追う

まず保存側(`groups.ts`のPOST `/groups/join`、抜粋)。

```ts
// 新メンバー参加の通知(Issue #249)。表示は作成から5分後で、その時点で参加者・受信者が
// 今もメンバーかを確認し直す(notifications.tsのfindVisibleNotifications参照)
await tx.notification.createMany({
  data: otherMembers.map((m) => ({
    recipientId: m.userId,
    actorId: userId,
    type: 'member_joined' as const,
    targetType: 'group' as const,
    targetId: group.id,
  })),
})
```

参加した瞬間に`notification`行は**即座に**作られる。`createdAt`はDBのデフォルト(現在時刻)のまま、後から遅らせるための特別なフラグなどは持たない。「隠す」処理は保存側ではなく、次の取得側(`notifications.ts`)に集約されている。

```ts
const IMMEDIATE_TYPES = ['reaction', 'comment', 'comment_reply'] as const
const DELAYED_TYPES = ['member_joined', 'personal_best', 'milestone', 'comeback'] as const
const DISPLAY_DELAY_MS = 5 * 60 * 1000

async function findVisibleNotifications(userId: string) {
  const notifications = await prisma.notification.findMany({
    where: {
      recipientId: userId,
      OR: [
        { type: { in: [...IMMEDIATE_TYPES] } },
        {
          type: { in: [...DELAYED_TYPES] },
          createdAt: { lte: new Date(Date.now() - DISPLAY_DELAY_MS) },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    include: { actor: { select: { id: true, displayName: true } } },
  })
  // ここから先、種類ごとに「まだ表示してよいか」を再確認する(下のmember_joinedの分岐を参照)
}
```

| ステップ | 何が起きるか | このときの値 |
|---|---|---|
| ① `type: { in: [...IMMEDIATE_TYPES] }` | いいね・コメントは無条件でこの`findMany`の対象に入る | - |
| ② `type: { in: [...DELAYED_TYPES] }, createdAt: { lte: ... }` | `member_joined`等は、**作成から5分経過したもの(`createdAt`が「今から5分前」以前)だけ**がこの`findMany`の対象に入る。参加した直後は`createdAt`が「今」なので、この条件に合わず`notifications`に含まれない | 参加直後は`findMany`の結果に現れない。curlで見た`[]`の正体はここ |

続けて、`member_joined`を対象に絞った後の再確認(表示側の2段目)。

```ts
// member_joined通知の表示可否と表示内容(グループ名)を引く。表示してよいのは、グループが削除されておらず、
// 参加者(actor)と受信者がどちらも今もそのグループのアクティブなメンバーである場合のみ
// (参加後5分以内に退会した・受信者が退会した等の場合は表示しない)
async function resolveMemberJoinedTargets(recipientId, notifications) {
  const groupIds = [...new Set(notifications.map((n) => n.targetId))]
  const userIds = [...new Set([recipientId, ...notifications.map((n) => n.actorId).filter((id) => id !== null)])]
  const [groups, memberships] = await Promise.all([
    prisma.group.findMany({ where: { id: { in: groupIds }, deletedAt: null }, select: { id: true, name: true } }),
    prisma.groupMember.findMany({ where: { groupId: { in: groupIds }, userId: { in: userIds }, leftAt: null }, select: { groupId: true, userId: true } }),
  ])
  const activeMemberKeys = new Set(memberships.map((m) => `${m.groupId}:${m.userId}`))
  return {
    groupNameById: new Map(groups.map((g) => [g.id, g.name])),
    isActiveMember: (groupId, userId) => activeMemberKeys.has(`${groupId}:${userId}`),
  }
}

// findVisibleNotifications内、member_joinedの分岐
const groupName = memberJoined.groupNameById.get(n.targetId)
if (
  groupName === undefined ||
  n.actorId === null ||
  !memberJoined.isActiveMember(n.targetId, n.actorId) ||
  !memberJoined.isActiveMember(n.targetId, userId)
) {
  continue // 表示しない
}
visible.push({ notification: n, target: { type: 'group', groupId: n.targetId, groupName } })
```

| ステップ | 何が起きるか |
|---|---|
| ① `groupName === undefined` | グループが削除済み(`deletedAt`あり)なら`groups`に含まれず`groupNameById`から引けない → 表示しない |
| ② `!isActiveMember(groupId, actorId)` | **参加した本人(行為者)が、5分の間に退会していないか**を今の`groupMember`テーブルで確認し直す |
| ③ `!isActiveMember(groupId, userId)` | **受信者(オーナーA)自身が、5分の間に退会していないか**も同様に確認する |

①の`findMany`(DBの取得条件)が「5分経過」という**時間の条件**を絞り込み、②③の再確認が「その5分の間に状況が変わっていないか」という**状態の条件**を絞り込む。この2段構えのおかげで、「参加してすぐ退会する」という誤操作があっても、5分経った時点で退会済みなら②で弾かれ、通知は表示されない。

### 3. 自分で壊して確かめる

- 具体例5と同じ要領で、`notification.createdAt`を直接6分前に書き換えて「5分経過後」を再現できる(実際にプロジェクトのテスト`backend/src/routes/notifications.test.ts`も、`prisma.notification.updateMany({ data: { createdAt: new Date(Date.now() - options.minutesAgo * 60 * 1000) } })`という同じ手口を使っている)。書き換えた直後に`GET /notifications`を送ると、さっき`[]`だった一覧に通知が現れることを確認できる
- `member_joined`の分岐から`!memberJoined.isActiveMember(n.targetId, n.actorId) || !memberJoined.isActiveMember(n.targetId, userId)`を一時的にコメントアウトして保存する(`tsx watch`が自動再起動)。その状態で、①ジョイナーBが参加した直後に退会する→②DBの`createdAt`を6分前に書き換える→③オーナーAが`GET /notifications`を送る、という手順を踏むと、本来は「参加者が退会済みだから表示しない」はずが、**退会後にもかかわらず「ジョイナーBさんがグループに参加しました」という通知が表示されてしまう**(実際に試すとそうなる)。これが「表示時の再確認」を外したときに起きる不具合そのもの。**試したら必ず元に戻すこと**

## 具体例6から読み取れる設計上の判断

- **「隠す」責務を保存側に持たせない** — `POST /groups/join`は通知を即座に(遅延フラグ無しで)作るだけで、いつ見せるかの判断を一切持たない。「いつ見せるか」は`findVisibleNotifications()`(取得側)に一本化されており、一覧・未読件数・一括既読の3つのAPIが同じ関数を通ることで、3つの結果が食い違わないようになっている(コード中のコメント参照)
- **「時間経過」と「状態の再確認」を別々の条件にする** — `findMany`のwhere(5分経過フィルタ)は取得件数を絞るための条件、`isActiveMember`等の再確認は取得**後**にアプリ側で行う条件、と役割を分けている。5分経過の判定をアプリ側でやらない理由もコメントに明記されている(直近50件の枠を未表示の通知が消費してしまうため)
- **遅延の目的は「誤操作を通知に出さないこと」** — 5分という時間そのものに意味があるのではなく、「保存直後の状態」と「多少時間が経った状態」が違うことがある(参加してすぐ退会する等)という前提に立ち、表示のタイミングをずらして状態が落ち着くのを待つ、という設計。具体例1〜5で見た「保存前に弾く」バリデーション・IDOR対策とは別の防御線

## 具体例7：いいね・コメントの認可と冪等性を判定するとき

最後の例として、[`backend/src/routes/workouts.ts`](../../backend/src/routes/workouts.ts)のPOST/DELETE `/workouts/:id/reactions`・GET/POST/DELETE `/workouts/:id/comments`を追う。トレ部の「交流」機能そのもの。具体例3の`findActiveMembership()`が「このグループに所属しているか」を1グループ単位で見るのに対し、こちらの`shareActiveGroup()`は「いずれかのグループで同席しているか」をグループを横断して見る点が違う。加えて、「いいねボタンを連打しても壊れない」ための冪等性と、「自分の記録には反応できない」という他の具体例には無い制約も扱う。

### 1. まず動かしてみる

具体例2・3で作った3アカウント(オーナー兼記録者A=`cookie.txt`、同じグループのB=`cookieB.txt`、どちらのグループにも属さないC=`cookieC.txt`)を使う。具体例3でAが最後にグループを削除しているので、この検証用に新しいグループを作り直し、Bだけ招待する。

```bash
# Aが新しいグループを作り、Bだけを招待する
curl -s -X POST http://localhost:3001/groups \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"name":"いいねコメント検証"}'
# => {"id":"<groupId>","inviteCode":"<code>", ...}

curl -X POST http://localhost:3001/groups/join \
  -H "Content-Type: application/json" -b cookieB.txt \
  -d '{"inviteCode":"<code>"}'
```

Aが記録を1件作る(具体例1と同じ手順。`<workoutId>`を控える)。

```bash
curl -s -X POST http://localhost:3001/workouts \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"performedAt":"2026-09-26"}'
```

ここから本題。**Aは自分の記録にいいねできない**。

```bash
curl -i -X POST http://localhost:3001/workouts/<workoutId>/reactions -b cookie.txt
# => HTTP/1.1 400 {"error":"cannot_react_to_own_workout"}
```

**Bは同じグループなのでいいねできる。しかも連打しても壊れない(冪等)**。

```bash
curl -X POST http://localhost:3001/workouts/<workoutId>/reactions -b cookieB.txt
# => {"reactionCount":1,"reactedByMe":true}
curl -X POST http://localhost:3001/workouts/<workoutId>/reactions -b cookieB.txt
# => {"reactionCount":1,"reactedByMe":true} (2回目も200。件数は増えない)
curl -X DELETE http://localhost:3001/workouts/<workoutId>/reactions -b cookieB.txt
# => {"reactionCount":0,"reactedByMe":false}
curl -X DELETE http://localhost:3001/workouts/<workoutId>/reactions -b cookieB.txt
# => {"reactionCount":0,"reactedByMe":false} (いいねしていない状態でのDELETEも200)
```

**Cはどちらのグループにも属さないので、存在自体が見えない(404)**。

```bash
curl -i -X POST http://localhost:3001/workouts/<workoutId>/reactions -b cookieC.txt
# => HTTP/1.1 404 {"error":"not_found"}
```

コメントも認可はいいねと同じ。Bが投稿し(`<commentId>`を控える)、Cは一覧すら見えず、**Aは記録の持ち主でも他人(B)のコメントは削除できない**。

```bash
curl -s -X POST http://localhost:3001/workouts/<workoutId>/comments \
  -H "Content-Type: application/json" -b cookieB.txt \
  -d '{"body":"ナイスベンチ!"}'
# => {"id":"<commentId>", "userId":"<BのユーザーID>", "displayName":"けんしょうB", "body":"ナイスベンチ!", ...}

curl -i http://localhost:3001/workouts/<workoutId>/comments -b cookieC.txt
# => HTTP/1.1 404 {"error":"not_found"}

curl -i -X DELETE http://localhost:3001/workouts/<workoutId>/comments/<commentId> -b cookie.txt
# => HTTP/1.1 404 {"error":"not_found"}(Aは記録の持ち主だが、このコメントの投稿者ではない)

curl -i -X DELETE http://localhost:3001/workouts/<workoutId>/comments/<commentId> -b cookieB.txt
# => HTTP/1.1 204(投稿者本人なら削除できる)
```

「見せるかどうか(グループで同席しているか)」と「操作していいか(自分のものか)」が別の判定になっている点が、具体例3の「所属チェック→ロールチェック」の2段構成と似ているようで少し違う。次はコードで確認する。

### 2. コードを実行順に追う

```ts
// viewerIdとownerIdが、いずれかのグループでアクティブなメンバーとして同席しているか(自分自身も含む)
async function shareActiveGroup(viewerId: string, ownerId: string) {
  if (viewerId === ownerId) return true
  const viewerGroupIds = (await prisma.groupMember.findMany({
    where: { userId: viewerId, leftAt: null, group: { deletedAt: null } },
    select: { groupId: true },
  })).map((m) => m.groupId)
  if (viewerGroupIds.length === 0) return false

  const shared = await prisma.groupMember.findFirst({
    where: { userId: ownerId, leftAt: null, groupId: { in: viewerGroupIds } },
  })
  return shared !== null
}

async function findAccessibleWorkout(viewerId: string, workoutId: string) {
  const workout = await prisma.workout.findFirst({ where: { id: workoutId, deletedAt: null } })
  if (!workout) return null
  const accessible = await shareActiveGroup(viewerId, workout.userId)
  return accessible ? workout : null
}

workoutsRouter.post('/:id/reactions', requireAuth, async (req, res) => {
  const userId = req.session.userId!
  const workout = await findAccessibleWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  if (workout.userId === userId) {
    res.status(400).json({ error: 'cannot_react_to_own_workout' })
    return
  }

  const alreadyReacted = await prisma.reaction.findUnique({
    where: { targetType_targetId_userId: { targetType: 'workout', targetId: workout.id, userId } },
  })
  await prisma.reaction.upsert({
    where: { targetType_targetId_userId: { targetType: 'workout', targetId: workout.id, userId } },
    create: { targetType: 'workout', targetId: workout.id, userId },
    update: {},
  })
  if (!alreadyReacted) {
    await notifyWorkoutOwner('reaction', workout.userId, userId, workout.id)
  }
  res.status(200).json({ reactionCount: await countReactions(workout.id), reactedByMe: true })
})
```

| ステップ | 何が起きるか | Aで試したとき | Bで試したとき | Cで試したとき |
|---|---|---|---|---|
| ① `shareActiveGroup(viewerId, ownerId)` | `viewerId === ownerId`(自分の記録)なら判定を省略して即`true`。それ以外は「viewerの所属グループID一覧」と「ownerがそのいずれかに(アクティブに)所属しているか」を2クエリで見る | `viewerId === ownerId`で即`true` | 共通のグループがあるので`true` | 所属グループが無いので`viewerGroupIds`が空 → `false` |
| ② `findAccessibleWorkout` | ①が`false`なら`null`を返し、呼び出し元は404にする。「存在しない」と「見えない」を区別しない(具体例3と同じIDOR対策の考え方) | `workout`を返す(自分の記録なので見える) | `workout`を返す | `null` → 404で打ち切り |
| ③ `if (workout.userId === userId)` | ②を通過した後、**自分の記録かどうか**を別途チェックする。①で「自分の記録は常にaccessible」としているのは「見えること」を保証するためで、「操作できること」までは保証しない。だからここで改めて400にする | ここで打ち切り(400) | 通過(他人の記録なので) | (到達しない) |
| ④ `alreadyReacted`を先に見てから`upsert` | UNIQUE制約(`targetType`・`targetId`・`userId`)違反を`upsert`で吸収して常に200を返す一方、「今回新しくいいねしたか」は`upsert`の前に取っておいた`alreadyReacted`で判定する | (到達しない) | 1回目は`alreadyReacted`が`null` → 通知作成。2回目は既に行があるので通知はスキップ | (到達しない) |

DELETE側にはこの③(自分の記録チェック)が無い。`shareActiveGroup`の`viewerId === ownerId`ショートカットにより、実は**Aは自分の記録に対して`DELETE /reactions`を呼べる**(何も無い状態から呼んでも冪等に200が返るだけで実害は無いが、「対称にDELETEにも同じ400を付けるべきでは」と考えて壊す前に一度実装を疑ってみるとよい練習になる)。

コメントの認可(`GET`/`POST /workouts/:id/comments`)は`findAccessibleWorkout`をそのまま使うので、いいねと全く同じ404の基準になる。一方、`DELETE /comments/:commentId`だけは判定が1段階増える。

```ts
workoutsRouter.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  const userId = req.session.userId!
  const workout = await findAccessibleWorkout(userId, req.params.id as string)
  if (!workout) {
    res.status(404).json({ error: 'not_found' })
    return
  }

  const comment = await prisma.comment.findFirst({
    where: { id: req.params.commentId as string, targetType: 'workout', targetId: workout.id, userId },
  })
  if (!comment) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  await prisma.comment.delete({ where: { id: comment.id } })
  res.status(204).send()
})
```

`comment`を探す`where`に`userId`(リクエストしてきた本人のID)が入っている。記録の持ち主Aであっても、`findFirst`の条件に一致しなければ`comment`は`null`になり404になる。「その記録が見えるか」(`findAccessibleWorkout`)と「そのコメントが自分のものか」(`where: { ..., userId }`)という、対象が違う2つの404を重ねている。

### 3. 自分で壊して確かめる

- `if (workout.userId === userId)`のブロックを一時的に`if (false && workout.userId === userId)`に変えて保存する(`tsx watch`が自動再起動)。その状態でAの`cookie.txt`で自分の記録にいいねするcurlを送ると、本来400になるはずが`200 {"reactedByMe":true}`で通ってしまう(実際に試すとそうなる)。**試したら必ず元に戻すこと**
- `if (!alreadyReacted) { await notifyWorkoutOwner(...) }`を一時的に`if (true || !alreadyReacted) { ... }`に変えて保存する。その状態でBが既にいいね済みの記録にもう一度・もう一度…と`POST /reactions`を3回送ると、`reactionCount`は1のまま変わらないのに、Aの`GET /notifications`で確認できる`reaction`通知が3件増える(実際に試すとそうなる)。**「DBの状態は冪等」と「通知が増えない」は別の実装で保証されている**ことが、壊すとよく分かる。**試したら必ず元に戻すこと**

## 具体例7から読み取れる設計上の判断

- **「対象範囲」の判定単位を機能ごとに使い分ける** — 具体例3の`findActiveMembership()`は「このグループの操作ができるか」を1グループ単位で見るのに対し、`shareActiveGroup()`は「いずれかのグループで同席しているか」をグループを横断して見る。いいね・コメントの対象範囲は「グループの記録フィードで見える記録」(`docs/schema.md`参照)と一致させる必要があるため、後者の形になっている
- **「見えること」と「操作できること」は別の判定にする** — `shareActiveGroup`は自分の記録を常に`accessible`として扱う(「見える」)が、いいね・コメントできるかは別途チェックする。「見えるが操作できない」状態を意図的に作れる設計になっている
- **冪等性は「DBの状態」と「副作用(通知)」で別々に保証する** — UNIQUE制約違反は`upsert`が吸収する一方、通知を作るかどうかは`upsert`より前に取得した`alreadyReacted`の値で判定する。1つの`if`に両方をまとめず、責務を分けている
- **「所有者かどうか」の404は、対象ごとに判定を重ねる** — コメント削除は「記録が見えるか」(`findAccessibleWorkout`)と「そのコメントが自分のものか」(`where: { ..., userId }`)を両方満たさないと`comment`が見つからず404になる。記録の持ち主であっても他人のコメントは消せない、という制約がこの2段階に表れている

## 具体例8：グループのランキングを集計するとき

もう1つの例として、[`backend/src/routes/groups.ts`](../../backend/src/routes/groups.ts)のGET `/groups/:id/ranking`を追う。具体例5(統計)は「自分1人分」の集計だったが、こちらは「グループの全メンバー分」を横に並べて順位を付ける集計になる。加えて、統計にはなかった「同着の扱い」「合計挙上重量とは別軸の指標(継続日数)を同じレスポンスに混ぜる」という2つの新しい設計判断が入っている。

### 1. まず動かしてみる

`backend`を`npm run dev`で起動した状態で試す。2つのアカウント(オーナーA・メンバーB)を具体例1の手順で作り、Aでグループを作ってBを招待コードで参加させておく(具体例3・6と同じ手順。`groupId`を控える)。

Aで公式種目(ベンチプレス)のセットを2つ記録する。

```bash
curl -s -X POST http://localhost:3001/workouts \
  -H "Content-Type: application/json" -b cookie.txt \
  -d "{\"performedAt\": \"$(date +%F)\"}"
# => {"id":"<workoutId>", ...}

curl -s -X POST http://localhost:3001/workouts/<workoutId>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<benchId>","weightKg":60,"reps":8}'
curl -s -X POST http://localhost:3001/workouts/<workoutId>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<benchId>","weightKg":65,"reps":5}'
```

Bは**自重種目(プッシュアップ)のセットのみ**を記録する(`weightKg`を指定しない)。

```bash
curl -s -X POST http://localhost:3001/workouts \
  -H "Content-Type: application/json" -b cookieB.txt \
  -d "{\"performedAt\": \"$(date +%F)\"}"
# => {"id":"<workoutIdB>", ...}

curl -s -X POST http://localhost:3001/workouts/<workoutIdB>/sets \
  -H "Content-Type: application/json" -b cookieB.txt \
  -d '{"exerciseId":"<pushupId>","reps":20}'
```

ここでAの週間ランキングを取得する。

```bash
curl -s -b cookie.txt "http://localhost:3001/groups/<groupId>/ranking?period=week"
```

```json
{"period":"week","exerciseId":null,"ranking":[
  {"userId":"<Aのid>","displayName":"...","totalVolumeKg":805,"daysTrained":1,"attendanceStamp":"bronze","rank":1},
  {"userId":"<Bのid>","displayName":"...","totalVolumeKg":0,"daysTrained":1,"attendanceStamp":"bronze","rank":2}
]}
```

ここで2つ注目してほしい。

- **Bの`totalVolumeKg`は`0`だが、一覧から消えていない**。具体例5(統計)の`GET /stats/volume`では自重セットは合計そのものから除外され、記録が無い日は結果に現れなかった。しかしランキングは「記録した/していない」を可視化する意味合いが強いため、自重種目でも0kgとして一覧に含める設計になっている(統計とランキングで自重セットの扱いが違う)
- **Bの`daysTrained`は`1`(=自重セットでもトレした日としてカウントされている)**。`totalVolumeKg`が0でも、直近28日にトレした日数を見る`daysTrained`・`attendanceStamp`は別の集計なので、こちらには影響しない。「挙上重量では0kgだが、継続の実績としては数えられている」という2つの指標のズレが実際に見える

続けて、種目別ランキング(`exerciseId`クエリ)も試してほしい。

```bash
curl -s -b cookie.txt "http://localhost:3001/groups/<groupId>/ranking?period=week&exerciseId=<pushupId>"
```

```json
{"period":"week","exerciseId":"<pushupId>","ranking":[
  {"userId":"<Aのid>", "totalVolumeKg":0, ..., "rank":1},
  {"userId":"<Bのid>", "totalVolumeKg":0, ..., "rank":1}
]}
```

プッシュアップを指定すると、AもBも記録が無い(またはあっても自重で0kg)ため、**2人とも`totalVolumeKg`が同じ`0`になり、`rank`も両方`1`になる**(同着)。この「同着の扱い」が次の「コードを実行順に追う」で見るポイント。

### 2. コードを実行順に追う

```ts
// 参加・継続の可視化(非順位)用のスタンプ段階
type AttendanceStamp = 'none' | 'bronze' | 'silver' | 'gold'
function attendanceStamp(daysTrained: number): AttendanceStamp {
  if (daysTrained >= 18) return 'gold'
  if (daysTrained >= 7) return 'silver'
  if (daysTrained >= 1) return 'bronze'
  return 'none'
}

groupsRouter.get('/:id/ranking', requireAuth, async (req, res) => {
  const membership = await findActiveMembership(userId, groupId)
  if (!membership) { /* 404 */ }

  const members = await prisma.groupMember.findMany({
    where: { groupId, leftAt: null },
    include: { user: { select: { displayName: true } } },
  })
  const memberIds = members.map((m) => m.userId)

  const sets = await prisma.workoutSet.findMany({
    where: {
      workout: { userId: { in: memberIds }, deletedAt: null, ...(startDate ? { performedAt: { gte: startDate } } : {}) },
      exercise: RANKING_OFFICIAL_EXERCISE_FILTER,
      ...(exerciseId ? { exerciseId } : {}),
    },
    select: { weightKg: true, reps: true, workout: { select: { userId: true } } },
  })

  const volumeByUserId = new Map<string, number>(memberIds.map((id) => [id, 0]))
  for (const set of sets) {
    const weightKg = set.weightKg === null ? 0 : Number(set.weightKg)
    const uid = set.workout.userId
    volumeByUserId.set(uid, (volumeByUserId.get(uid) ?? 0) + weightKg * set.reps)
  }
  // ...(daysTrainedByUserIdの集計は別クエリ。後述)

  const sorted = members
    .map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      totalVolumeKg: volumeByUserId.get(m.userId) ?? 0,
      daysTrained: daysTrainedByUserId.get(m.userId) ?? 0,
      attendanceStamp: attendanceStamp(daysTrainedByUserId.get(m.userId) ?? 0),
    }))
    .sort((a, b) => b.totalVolumeKg - a.totalVolumeKg || a.displayName.localeCompare(b.displayName))

  // 同着は同順位、次の順位は人数分スキップする方式(例: 1,2,2,4)
  let rank = 0
  let prevVolumeKg: number | null = null
  const ranking = sorted.map((entry, index) => {
    if (entry.totalVolumeKg !== prevVolumeKg) {
      rank = index + 1
      prevVolumeKg = entry.totalVolumeKg
    }
    return { ...entry, rank }
  })

  res.status(200).json({ period: parsed.data.period, exerciseId: exerciseId ?? null, ranking })
})
```

| ステップ | 何が起きるか | Bの自重セットへの影響 |
|---|---|---|
| ① `prisma.workoutSet.findMany({ where: {...} })` | 具体例5の`/stats/volume`と似た`where`だが、**`weightKg: { not: null }`が無い**。自重セット(`weightKg`が`null`)も`sets`に含まれる | Bのプッシュアップのセットが`sets`に入る |
| ② `weightKg = set.weightKg === null ? 0 : Number(set.weightKg)` | `null`を除外するのではなく`0`として計算に使う。掛け算(`weightKg * reps`)の結果も`0`になるので、合計への寄与は無いが、「1件のトレとして数えられている」という次のポイントに繋がる | `0 * 20 = 0`が加算される(実質変化なし) |
| ③ `volumeByUserId = new Map(memberIds.map((id) => [id, 0]))` | 全メンバーを先に`0`で初期化してから積み上げる。ただし後述のとおり、④の`?? 0`で結局同じ結果になるため、実質的には冗長な初期化になっている(「自分で壊して確かめる」参照) | - |
| ④ `totalVolumeKg: volumeByUserId.get(m.userId) ?? 0` | `sorted`は`members`(グループの全メンバー)を元に組み立てるため、`sets`に1件もヒットしなかったメンバーも`?? 0`で必ず一覧に入る。統計(`/stats/volume`)が「該当日のみ返す」のとは対照的に、ランキングは「メンバー全員を常に返す」設計 | Bも一覧から漏れない |
| ⑤ `.sort((a, b) => b.totalVolumeKg - a.totalVolumeKg \|\| a.displayName.localeCompare(b.displayName))` | 合計挙上重量の降順。同点の場合は表示名の昇順(`localeCompare`)で安定させる。ソート自体は「同じ値でもどちらかを先に置く」処理で、同着かどうかの判定(⑥)とは別 | - |
| ⑥ `if (entry.totalVolumeKg !== prevVolumeKg) { rank = index + 1 }` | 直前のエントリと`totalVolumeKg`が同じなら`rank`を更新せず、直前と同じ順位を使う。プッシュアップ指定で両者とも`0`になったとき、2人目で`entry.totalVolumeKg !== prevVolumeKg`が`false`になり、Aと同じ`rank: 1`になる。もしこの分岐が無いと`sort`後の`index`をそのまま`rank`にすることになり、同着でも1,2と別の順位が振られてしまう | プッシュアップ指定時、AもBも`rank: 1`になる |

`daysTrained`・`attendanceStamp`側の集計はもう1つの独立したクエリ。

```ts
const attendanceCounts = await prisma.workout.groupBy({
  by: ['userId'],
  where: {
    userId: { in: memberIds },
    deletedAt: null,
    performedAt: { gte: recentWindowStart(new Date()) }, // 直近28日
    sets: { some: {} }, // セットが1件以上ある日のみ(自重・カスタム種目でもよい)
  },
  _count: { _all: true },
})
```

このクエリには`exercise: RANKING_OFFICIAL_EXERCISE_FILTER`のような種目の絞り込みが無い。「トレした日数」は挙上重量の対象種目とは無関係に数えるという設計であり、`period`(週間/月間/通算)や`exerciseId`(種目別)を切り替えても、`daysTrained`・`attendanceStamp`の値は**常に直近28日固定**で変わらない(フロント側で「継続」タブが期間タブを持たない理由もここに繋がる)。

### 3. 自分で壊して確かめる

- `const volumeByUserId = new Map<string, number>(memberIds.map((id) => [id, 0]))`を一時的に`new Map<string, number>()`に変えて保存する(`tsx watch`が自動再起動)。その状態で同じcurlを送っても、**結果は変わらない**(実際に試すと`totalVolumeKg`は変わらずBも一覧に残る)。理由は上の④で見た`volumeByUserId.get(m.userId) ?? 0`が、`sorted`を`members`から組み立てる際に同じ「無ければ0」を保証しているため。コード中のコメント(「記録が無いメンバーも0kgで一覧に含めるため、先に全メンバーを0で初期化しておく」)は意図の説明として書かれているが、実際にその役割を担っているのは④の`?? 0`の方であることが、壊してみて初めてわかる。**試したら必ず元に戻すこと**
- `sorted.map((entry, index) => { rank = index + 1; return { ...entry, rank } })`のように、同着判定の`if`を外して常に`index + 1`を使う形に一時的に変えて保存する。その状態でプッシュアップ指定(`exerciseId=<pushupId>`)のランキングを取得すると、AとBが両方`0kg`なのに`rank`が`1`と`2`に分かれてしまう(実際に試すとそうなる)。「同点なら同じ順位」という表示上の前提が、この1つの`if`だけで支えられていることが体感できる。**試したら必ず元に戻すこと**
- `exercise: RANKING_OFFICIAL_EXERCISE_FILTER`を`sets`の`where`から一時的に外して保存する。Aが公式種目とは別にカスタム種目(例:`weightKg:100, reps:3`)を記録していると、外した状態では合計にその300kg分が上乗せされてしまう(具体例5の`/stats/volume`と同じ壊し方)。**試したら必ず元に戻すこと**

## 具体例8から読み取れる設計上の判断

- **「常に全員を返す」設計にする** — 統計(`/stats/volume`)は該当日のみを返すが、ランキングは所属メンバー全員を常に返す。順位を見せる以上、記録が無い人を除外すると「誰が何位か」が分からなくなるため
- **自重セットの扱いを機能ごとに変える** — 統計は自重セットを合計から除外するが、ランキングは「0kgとして扱い一覧には含める」。同じ`weightKg: null`というデータでも、「集計から見えなくする」か「0として参加させる」かは機能の目的次第で変えている(`schema.md`「Phase4の検討結果」参照)
- **「順位」と「継続」を別クエリ・別ロジックで独立させる** — `totalVolumeKg`(期間・種目で変わる)と`daysTrained`/`attendanceStamp`(常に直近28日固定)は、同じレスポンスに混ぜて返しつつ、算出方法は完全に独立している。フロント側が「継続」タブを別軸の一覧として扱えるのは、バックエンド側でこの2つが最初から混ざらない設計になっているため
- **同着の順位計算は「直前のエントリとの比較」1箇所に集約する** — `rank`を`index`から機械的に振るのではなく、`prevVolumeKg`との比較で「同じなら据え置き」を明示的に書く。この1つの`if`が無いと、同点でも別々の順位が付いてしまう

## 具体例9：パスワード再設定のトークンを検証するとき

[`backend/src/routes/auth.ts`](../../backend/src/routes/auth.ts)のPOST `/auth/password-reset-requests`とPOST `/auth/password-resets`を追う。ログイン(具体例2)は「知っているパスワードで認証する」仕組みだったが、こちらは「メールに届いたリンク(トークン)を知っていることを認可の根拠にする」という別の仕組みで、`express-session`のセッションIDとは無関係に動く。加えて、これまでの具体例には無かった「メール送信」という外部サービス連携も初めて扱う。

### 1. まず動かしてみる

具体例1で登録したアカウント(`test@example.com`)を使う。まず、パスワード再設定をリクエストする。

```bash
curl -i -X POST http://localhost:3001/auth/password-reset-requests \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
# => HTTP/1.1 202 {"ok":true}
```

**存在しないメールアドレスでも、同じ`202`が返る**(メールアドレス列挙対策)。

```bash
curl -i -X POST http://localhost:3001/auth/password-reset-requests \
  -H "Content-Type: application/json" \
  -d '{"email":"no-such-user@example.com"}'
# => HTTP/1.1 202 {"ok":true} (存在するかどうかでレスポンスを変えない)
```

送信先の実際のメールは、`SENDGRID_API_KEY`・`MAIL_FROM_ADDRESS`が未設定のローカル開発環境では飛ばず、`npm run dev`のターミナル出力にリセットURLがそのまま出る(この2つの環境変数が設定されている環境では実際にSendGridでメール送信される。検証で無関係なアドレスに送ってしまわないよう注意)。

```
[mail] SENDGRID_API_KEY/MAIL_FROM_ADDRESS未設定のため送信をスキップしました。
[mail] パスワード再設定URL: http://localhost:3000/password-reset/<token>
```

このログの`<token>`を控えて、新しいパスワードを設定する。

```bash
curl -i -X POST http://localhost:3001/auth/password-resets \
  -H "Content-Type: application/json" \
  -d '{"token":"<token>","password":"NewPassw0rd!"}'
# => HTTP/1.1 200 {"ok":true}
```

**同じトークンはもう一度使えない(使い切り)**。

```bash
curl -i -X POST http://localhost:3001/auth/password-resets \
  -H "Content-Type: application/json" \
  -d '{"token":"<token>","password":"AnotherPass1!"}'
# => HTTP/1.1 400 {"error":"invalid_or_expired_token"}
```

**存在しない・でたらめなトークンも同じエラーになる**(有効期限切れと見分けが付かない)。

```bash
curl -i -X POST http://localhost:3001/auth/password-resets \
  -H "Content-Type: application/json" \
  -d '{"token":"totally-invalid-token","password":"WhateverPass1!"}'
# => HTTP/1.1 400 {"error":"invalid_or_expired_token"}
```

新しいパスワードでログインできることも確認しておく。

```bash
curl -i -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"NewPassw0rd!"}'
# => HTTP/1.1 200 {"id":"...", ...}
```

### 2. コードを実行順に追う

```ts
// パスワード再設定トークンの有効期限
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1時間

// DB漏洩時にトークンをそのまま悪用されないよう、生の値ではなくハッシュを保存する
function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

authRouter.post('/password-reset-requests', passwordResetRequestRateLimiter, async (req, res) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body)
  if (!parsed.success) { /* 400 */ }
  const { email } = parsed.data
  const user = await prisma.user.findUnique({ where: { email } })
  // メールアドレス列挙対策：ユーザーが存在しない場合も同じレスポンスを返す
  if (user) {
    const token = randomBytes(32).toString('hex')
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashPasswordResetToken(token),
        passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    })
    const resetUrl = `${process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000'}/password-reset/${token}`
    await sendPasswordResetEmail(email, resetUrl)
  }
  res.status(202).json({ ok: true })
})

authRouter.post('/password-resets', async (req, res) => {
  const parsed = passwordResetSchema.safeParse(req.body)
  if (!parsed.success) { /* 400 */ }
  const { token, password } = parsed.data
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashPasswordResetToken(token),
      passwordResetExpiresAt: { gt: new Date() },
    },
  })
  if (!user) {
    res.status(400).json({ error: 'invalid_or_expired_token' })
    return
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordResetToken: null, passwordResetExpiresAt: null },
  })
  res.status(200).json({ ok: true })
})
```

| ステップ | 何が起きるか |
|---|---|
| ① `randomBytes(32).toString('hex')` | 32バイトの暗号論的乱数を16進文字列(64文字)にしたものがトークンの生の値。これがメールのURLに載る |
| ② `hashPasswordResetToken(token)` | DBには生の値ではなくSHA-256ハッシュを保存する(`users.password_reset_token`)。パスワードの`bcrypt`とは違い、`createHash('sha256')`の単純な一方向ハッシュ(パスワードは人間が選ぶため辞書攻撃に強い低速なハッシュが要るが、トークンは32バイトの乱数で総当たりが非現実的なため、同じ強度は求めていないと考えられる) |
| ③ `if (user) { ... }`の中でしかトークンを発行しない | `findUnique`で見つからなければ、この中身を丸ごとスキップして`202`を返す。**ユーザーの有無で処理時間・レスポンス内容を変えない**ことが列挙対策の本体で、「常に202を返す」という表面のルールだけでなく、分岐そのものがここにある |
| ④ `passwordResetExpiresAt: { gt: new Date() }` | `/password-resets`側の検索条件。**期限切れかどうかを事前にチェックする専用コードは無く**、検索条件に含めることで「見つからない」=「無効(存在しない/期限切れ/使用済みのどれか)」に自然と合流させている。だからこそ有効期限切れと不正なトークンが同じ`invalid_or_expired_token`になる |
| ⑤ `passwordResetToken: null, passwordResetExpiresAt: null` | 成功時にこの2つを`null`に戻す。次に同じトークンで検索しても④の条件に一致しなくなるため、これが「使い切り」の実体(専用の「使用済みフラグ」列は無い) |

メール送信本体は[`backend/src/lib/mail.ts`](../../backend/src/lib/mail.ts)の`sendPasswordResetEmail()`。`SENDGRID_API_KEY`・`MAIL_FROM_ADDRESS`のどちらかが未設定なら送信をスキップしてURLを`console.log`するだけ、という分岐がローカル開発でも実際にメールを受け取らずに検証を完結させている理由。

### 3. 自分で壊して確かめる

- `/password-resets`の`where`から`passwordResetExpiresAt: { gt: new Date() }`を一時的に外して保存する。その状態で、`まず動かしてみる`で一度使い切ったトークンをもう一度試すとどうなるか確認する(実際に試すと、`passwordResetToken`は使用後`null`に戻っているため、この条件を外しても`findFirst`は結局ヒットせず`400`のままになる。「使い切り」を支えているのは有効期限の条件ではなく⑤の`null`への書き戻しの方だと分かる)。**試したら必ず元に戻すこと**
- `hashPasswordResetToken()`の実装を一時的に`return token`(ハッシュ化せずそのまま返す)に変えて保存する。この状態で新しくリクエストしたトークンを使うと、これまでと同じく`200`が返り、挙動は変わらない(実際に試すとそうなる)。DBの中身を見比べない限り「ハッシュ化しているかどうか」はAPIの外からは区別が付かず、`password_reset_token`列に生の値が保存されるようになることが分かる。**試したら必ず元に戻すこと**
- レート制限(`express-rate-limit`)は`passwordResetRequestRateLimiter`が`/password-reset-requests`にのみ付いている。`/password-resets`側にはレート制限が無い(トークン自体が推測困難な64文字の乱数であることだけが頼り)ことも、コードを読むと確認できる

## 具体例9から読み取れる設計上の判断

- **トークンは「専用の使用済みフラグ」ではなく「値を`null`に戻す」ことで使い切りを表現する** — `passwordResetToken`・`passwordResetExpiresAt`という2つの列だけで、発行前・有効・使用済み/期限切れの3状態を表す。使用済みかどうかを判定する専用のコードは無く、`findFirst`の検索条件に一致しなくなること自体が「無効」の判定になっている
- **有効期限切れと不正なトークンをレスポンス上区別しない** — どちらも同じ`invalid_or_expired_token`。攻撃者に「トークンの形式は合っているが期限切れなだけ」という情報を与えないための設計(ログイン(具体例2)の`invalid_credentials`が「メールアドレス自体が存在しない」場合と区別しないのと同じ考え方)
- **ローカル開発とメール送信を両立させる分岐を1箇所に閉じ込める** — `sendPasswordResetEmail()`内の「APIキー未設定ならログ出力に留める」という分岐のおかげで、呼び出し側(`password-reset-requests`のハンドラ)はローカルか本番かを意識せず同じコードで書ける
- **メール再設定によるパスワード変更は、他端末のセッションを無効化しない**(`docs/backlog.md`「判断保留(再検討のタイミング待ち)」に既知の未対応事項として記載済み)。トークンによる認可の外側で、`express-session`のセッション自体は別ライフサイクルで動いているため、パスワードを変えても既存のログイン状態(Cookie)はそのまま残る

## 具体例10：ログイン中にパスワードを変更するとき

具体例9は「メールのリンク(トークン)を知っていることを認可の根拠にする」未ログインの仕組みだったが、[`backend/src/routes/auth.ts`](../../backend/src/routes/auth.ts)のPOST `/auth/password-changes`は逆に、**ログイン中の本人**が現在のパスワードを入力して変更する仕組み。同じ「パスワードを変える」操作でも、認可の根拠(トークン vs セッション)が異なると、レート制限の考え方まで変わることが読み取れる。

### 1. まず動かしてみる

`backend`を`npm run dev`で起動した状態で試す。具体例1の`cookie.txt`(ログイン済み)を使う。

```bash
# 現在のパスワードを間違える
curl -s -i -b cookie.txt -X POST http://localhost:3001/auth/password-changes \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"wrong","newPassword":"anotherpassword123"}'
```

```json
HTTP/1.1 400 Bad Request
{"error":"invalid_current_password"}
```

ここで2つ試してほしい。

- **現在と同じパスワードを新しいパスワードに指定する**(`{"currentPassword":"password123","newPassword":"password123"}`) → `400 {"error":"same_as_current_password"}`
- **正しく変更する**(`{"currentPassword":"password123","newPassword":"newpassword456"}`) → `200 {"ok":true}`。直後に`curl -b cookie.txt http://localhost:3001/auth/me`を叩くと、**ログアウトさせられておらず`200`のまま**であることが確認できる。パスワードを変えてもセッションは維持される設計

もう1つ、具体例9とまたがる確認をしておく。パスワード変更の**前**に`POST /auth/password-reset-requests`でリセットトークンを発行しておき(具体例9参照)、そのトークンを使わないまま`password-changes`でパスワードを変更する。その後、変更前に発行したトークンで`POST /auth/password-resets`を呼ぶと、

```json
HTTP/1.1 400 Bad Request
{"error":"invalid_or_expired_token"}
```

トークンはまだ有効期限内(1時間)のはずだが、`password-changes`側の処理でこのトークンを失効させているため使えなくなる(実際に確認済み)。

### 2. コードを実行順に追う

```ts
const passwordChangeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.session.userId!,
  skip: () => process.env.NODE_ENV === 'test',
})

authRouter.post('/password-changes', requireAuth, passwordChangeRateLimiter, async (req, res) => {
  const parsed = passwordChangeSchema.safeParse(req.body)
  if (!parsed.success) { /* 400 */ }
  const { currentPassword, newPassword } = parsed.data

  const user = await prisma.user.findUnique({ where: { id: req.session.userId } })
  if (!user) { /* 401、セッションも破棄 */ }

  const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!passwordMatches) {
    res.status(400).json({ error: 'invalid_current_password' })
    return
  }

  if (newPassword === currentPassword) {
    res.status(400).json({ error: 'same_as_current_password' })
    return
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordResetToken: null, passwordResetExpiresAt: null },
  })

  res.status(200).json({ ok: true })
})
```

| ステップ | 何が起きるか |
|---|---|
| ① `requireAuth`(第2引数) | ログイン必須。具体例1の`requireAuth`と同じミドルウェア。具体例9の2エンドポイントには無かった制約 |
| ② `passwordChangeRateLimiter`(第3引数) | `keyGenerator: (req) => req.session.userId!`で、**IPではなくユーザーID単位**にレート制限する。具体例9の`passwordResetRequestRateLimiter`は未ログイン状態からの攻撃を想定してIP単位で数えるが、こちらはセッションを乗っ取った攻撃者が自分の現在のパスワードを知らずに総当たりする状況を想定している。攻撃者はIPを変えられてもセッション(=`userId`)は変えられないため、ユーザー単位で数える方が防御として意味を持つ |
| ③ `bcrypt.compare(currentPassword, user.passwordHash)` | ログイン中に本人確認をやり直す。ここが一致しなければ`400 invalid_current_password`で終了 |
| ④ `if (newPassword === currentPassword)` | ③の比較を通過した後なので、`currentPassword`は「本物の現在のパスワード」と確定している。よって新しいパスワードとの比較は、③のように`bcrypt.compare`をもう一度呼ばず**入力値どうしの単純な文字列比較で足りる** |
| ⑤ `passwordResetToken: null, passwordResetExpiresAt: null`も一緒に更新 | ログイン中の変更なのに、なぜメールリセット用のトークンまで消すのか。もし消さないと、変更前に発行して未使用のまま残っていたメールリンクが、変更後もそのまま有効なままになってしまう。具体例9とは別のAPIだが、「有効なパスワード変更手段が同時に2つ生き残らないようにする」ためにここで揃えて失効させている(「まず動かしてみる」で確認した挙動の実体) |

### 3. 自分で壊して確かめる

- `if (newPassword === currentPassword)`を一時的にコメントアウトして保存すると、同じパスワードへの「変更」が`200`で成功するようになる(実際に確認済み)。実害は無さそうに見えるが、「変更しました」という成功メッセージが実際には何も変えていないという、ユーザーへの誤った状態通知を許すことになる。**試したら必ず元に戻すこと**
- `passwordResetToken: null, passwordResetExpiresAt: null`を一時的に外して(`data: { passwordHash }`だけにして)保存すると、どうなるか考えてみる。「まず動かしてみる」で確認した「変更前に発行したトークンが変更後は使えなくなる」という挙動が効かなくなり、古いメールリンクが変更後もそのまま有効なままになってしまうはずだ。実際に試す場合は、リセットトークンを発行→`password-changes`で変更→そのトークンで`password-resets`を呼び、`400`ではなく`200`が返ることを確認する。**この変更は「本来失効しているはずの手段をもう一度使えるようにする」ものなので、試す場合は自分のローカル環境限定にし、確認後は必ず元に戻すこと**(この項目自体は今回コードを読んで導いた予想であり、実際に崩して確認するところまでは行っていない)
- `passwordChangeRateLimiter`の`keyGenerator`を`(req) => req.ip`に一時的に変えて考えてみる(実際に動かすには複数セッションが要るため、まずはコードを読んで考えるだけでよい)。IP単位に変えると、社内ネットワークやスマホの共有回線など同じIPを複数ユーザーが使う環境で、無関係な他ユーザーの操作が自分のレート制限を消費してしまう。ユーザー単位にしている②の設計判断が、この巻き添えを避けるためでもあることが分かる

## 具体例10から読み取れる設計上の判断

- **「ログイン中の変更」と「ログアウト中の再設定」を別々のAPI・別々のレート制限単位にする** — `password-changes`はログイン必須でユーザーID単位のレート制限、具体例9の2エンドポイントは未ログインでIP単位のレート制限。想定する攻撃者の状態(セッションを乗っ取れているか、そもそもログインできていないか)が違うため、レート制限の数え方もそれに合わせて変えている
- **パスワードの変更経路が複数あるときは、お互いを無効化し合う** — ログイン中の変更は、未使用のメールリセットトークンも一緒に失効させる。「今から有効なパスワード変更手段」を常に1つに保つことで、過去に発行したまま忘れていたリンクが後から悪用される余地を無くしている。具体例9の「読み取れる設計上の判断」にある「メール再設定によるパスワード変更は、他端末のセッションを無効化しない」とは逆方向の設計で、こちらは「ログイン中の変更が、未使用のメールリセット手段を無効化する」。パスワードの変更経路が複数ある設計では、どちらの方向で無効化するかを個別に決めている

## 具体例11：カスタム種目を追加・削除するとき

具体例4では、ルーティンに種目を追加するときの`isExerciseVisible()`(公式種目 or 自分の未削除カスタム種目かどうかの判定)に軽く触れた。今回はその判定の元になる[`backend/src/routes/exercises.ts`](../../backend/src/routes/exercises.ts)のPOST `/exercises`・DELETE `/exercises/:id`自体を追い、「カスタム種目を消しても過去の記録は壊れない」ためにどんな設計をしているかを見る。加えて、`workouts.ts`が持つ同名の`isExerciseVisible()`(具体例4で見たものとは別実装)には、routines側には無い例外が1つあることも確認する。

### 1. まず動かしてみる

`backend`を`npm run dev`で起動した状態で試す。具体例1の`cookie.txt`(ログイン済み)を使う。

まずカスタム種目を1件作る。

```bash
curl -s -X POST http://localhost:3001/exercises \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"name":"検証用カスタム種目","muscleGroup":"chest"}'
```

```json
HTTP/1.1 201 Created
{"id":"<exerciseId>","name":"検証用カスタム種目","muscleGroup":"chest","muscleDetail":null,"equipment":null,"createdBy":"<AのユーザーID>","mainMuscle":null,"relatedMuscles":[],"mainZone":null,"deletedAt":null,"lastSet":null}
```

`GET /exercises`の一覧にもこの種目が並ぶ(`useCount: 0`)ことを確認しておく。削除する(ソフトデリート)。

```bash
curl -i -X DELETE http://localhost:3001/exercises/<exerciseId> -b cookie.txt
# => HTTP/1.1 204 No Content
```

一覧から消えるのではなく、**`deletedAt`が入った状態でそのまま残っている**ことが`GET /exercises`で確認できる。同じIDにもう一度DELETEを送ると`404 {"error":"not_found"}`(削除済みは「もう存在しない」扱い)。

具体例2・3で作ったBのアカウント(`cookieB.txt`)で、**他人の種目を消せるか**も試しておく。まだ削除していない別のカスタム種目を先に1つ作り、Bのクッキーで消そうとする。

```bash
curl -i -X DELETE http://localhost:3001/exercises/<別のexerciseId> -b cookieB.txt
# => HTTP/1.1 404 {"error":"not_found"}
```

公式種目(具体例1で使った「ベンチプレス」の`<exerciseId>`)を自分のクッキーで消そうとしても同じ404になる。「他人の種目」「公式種目」「もう無い種目」を区別せず、全部404にしている。

最後に、削除したカスタム種目が記録作成とどう絡むかを見る。新しいカスタム種目を作り、workoutを1件作ってそのセットを1件追加した**あとで**、その種目を削除する。

```bash
# 種目を作る(以降<ex2Id>とする)
curl -s -X POST http://localhost:3001/exercises -H "Content-Type: application/json" -b cookie.txt \
  -d '{"name":"検証用カスタム種目2","muscleGroup":"back"}'

# workoutを作る(以降<workoutId>とする)
curl -s -X POST http://localhost:3001/workouts -H "Content-Type: application/json" -b cookie.txt \
  -d '{"performedAt":"2026-09-26"}'

# セットを1件追加(削除前)
curl -s -X POST http://localhost:3001/workouts/<workoutId>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<ex2Id>","weightKg":40,"reps":10}'

# 種目を削除
curl -i -X DELETE http://localhost:3001/exercises/<ex2Id> -b cookie.txt
# => 204
```

削除したあとで、**同じworkoutに同じ種目のセットをもう1件追加する**と、

```bash
curl -i -X POST http://localhost:3001/workouts/<workoutId>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<ex2Id>","weightKg":45,"reps":8}'
# => HTTP/1.1 201 Created (成功する)
```

意外にも**成功する**。ところが、**別の新しいworkoutで**同じ種目を使おうとすると、

```bash
curl -s -X POST http://localhost:3001/workouts -H "Content-Type: application/json" -b cookie.txt \
  -d '{"performedAt":"2026-09-27"}'
# => 新しいworkoutId

curl -i -X POST http://localhost:3001/workouts/<新しいworkoutId>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<ex2Id>","weightKg":45,"reps":8}'
# => HTTP/1.1 400 {"error":"invalid_exercise"}
```

今度は弾かれる。同じ「削除済みのカスタム種目」を指定しているのに、workoutが違うだけで結果が変わる。次でこの理由を追う。

### 2. コードを実行順に追う

まずPOST `/exercises`とDELETE `/exercises/:id`。

```ts
exercisesRouter.post('/', requireAuth, async (req, res) => {
  const { name, muscleGroup, muscleDetail, equipment } = parsed.data
  const exercise = await prisma.exercise.create({
    data: { name, muscleGroup, muscleDetail, equipment, createdBy: userId },
  })
  res.status(201).json({ /* ...レスポンス整形... */ })
})

exercisesRouter.delete('/:id', requireAuth, async (req, res) => {
  const exercise = await prisma.exercise.findFirst({
    where: { id: req.params.id as string, createdBy: userId, deletedAt: null },
  })
  if (!exercise) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  await prisma.exercise.update({ where: { id: exercise.id }, data: { deletedAt: new Date() } })
  res.status(204).end()
})
```

| ステップ | 何が起きるか |
|---|---|
| ① `prisma.exercise.create({ data: { ..., createdBy: userId } })` | `createdBy`に必ず自分のIDが入る。公式種目(`createdBy: null`)は誰も`POST`からは作れない(seedで投入されたものだけ) |
| ② DELETE側の`findFirst`条件`{ id, createdBy: userId, deletedAt: null }` | **所有者チェックと未削除チェックを1つのクエリに畳み込んでいる**。他人の種目・公式種目(`createdBy`が自分のIDと不一致)・削除済みの種目(`deletedAt`が`null`でない)は、理由に関わらず同じ`exercise === null`になり同じ404を返す。具体例3・7で見たIDOR対策の404(「存在を隠す」)と、「もう一度は削除できない」という状態の404が、同じ条件式の中で自然に合流している |
| ③ `deletedAt: new Date()` | 物理削除ではないので、`workout_sets`・`routine_exercises`が持つ`exerciseId`はそのまま有効な外部キーであり続ける。過去の記録の種目名解決が壊れない(コード先頭のコメント参照) |

`GET /exercises`が削除済みの種目も一覧に残す理由もここにある。もし`WHERE`に`deletedAt: null`を加えて除外すると、削除した種目を含む過去の記録を開いたときに種目名を解決できなくなる(フロント側は`deletedAt`を見て選択肢からだけ除外する。frontend-guide.md参照)。

次に、削除済みの種目でworkoutごとに結果が変わった理由。`workouts.ts`の`isExerciseVisible`は、具体例4の`routines.ts`版と同じ名前だが実装が違う。

```ts
async function isExerciseVisible(userId: string, exerciseId: string, workoutId?: string) {
  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, OR: [{ createdBy: null }, { createdBy: userId }] },
  })
  if (!exercise) return false
  if (exercise.deletedAt === null) return true
  if (!workoutId) return false

  const existingSet = await prisma.workoutSet.findFirst({ where: { workoutId, exerciseId } })
  return existingSet !== null
}
```

| ステップ | 何が起きるか | 既存workoutでの2回目のPOST | 新しいworkoutでのPOST |
|---|---|---|---|
| ① `exercise`が公式 or 自分のカスタム種目か | ここは具体例4と同じ | 通過 | 通過 |
| ② `if (exercise.deletedAt === null) return true` | 削除されていなければここで即`true`。削除済みなら次へ | (削除済みなので通過せず次へ) | (同左) |
| ③ `if (!workoutId) return false` | `workoutId`が渡っていなければ(routines.tsの呼び出しなど)ここで`false`確定 | `workoutId`はPOST `/workouts/:id/sets`から必ず渡るので通過 | 通過 |
| ④ `existingSet !== null` | **そのworkoutの中に、この種目のセットが既に1件でもあるか**を見る。「削除済みの種目を新しく使い始める」のは禁止だが、「削除する前からこのworkoutで使っていた種目カードに追記する」のは許す、という例外 | 削除前に1件追加済みなので`existingSet`が見つかる → `true` | このworkoutでは1件も使っていないので`existingSet`は`null` → `false` → `400 invalid_exercise` |

`routines.ts`側の`isExerciseVisible(userId, exerciseId)`には③④が無い(`workoutId`という概念自体が無い)。そのため、**削除したカスタム種目は、既存のルーティンに種目カードが無ければルーティンには二度と追加できない**(workoutsのような「追記だけは許す」抜け道が無い)。同じ「削除済みのカスタム種目をどう扱うか」という問いに、機能ごとに違う答えを出している。

### 3. 自分で壊して確かめる

- DELETE側の`findFirst`の`where`から`deletedAt: null`を一時的に外して保存する(`tsx watch`が自動再起動)。その状態で、既に削除済みの種目に対してもう一度同じDELETEを送ると、本来`404`になるはずが`204`で「成功」してしまう(`deletedAt`を今の時刻でもう一度上書きするだけなので実害は薄いが、「削除は初回しか意味を持たない」という前提が崩れていることが分かる)。**試したら必ず元に戻すこと**
- `isExerciseVisible`(workouts.ts版)の`if (!workoutId) return false`を一時的に`if (!workoutId) return true`に変えて保存する。その状態で、**新しいworkoutに削除済みのカスタム種目のセットを追加する**curlを送ると、本来`400 invalid_exercise`になるはずが`201`で通ってしまう。「削除済みの種目を新規に使い始められない」という制約がこの1行だけで支えられていることが体感できる。**試したら必ず元に戻すこと**

## 具体例11から読み取れる設計上の判断

- **ソフトデリートは「もう選べない」であって「消えた」ではない** — `deletedAt`はDELETEの`WHERE`(所有者・未削除の2条件)には使うが、`GET /exercises`の`WHERE`には使わない。一覧に残し続けることで、過去の記録・ルーティンからの参照(`exerciseId`という外部キー)が壊れないようにしている。「新規に選べるかどうか」はフロント側が`deletedAt`を見て絞り込み、バックエンドは「存在するかどうか」だけを保証する、という役割分担になっている
- **同名の関数でも、機能ごとに例外を持たせるかどうかを個別に決める** — `workouts.ts`の`isExerciseVisible`は「削除済みでも、そのworkoutで既に使っていた種目なら追記を許す」という、具体例4の`routines.ts`版には無い例外を持つ。ワークアウト記録は同じ日の記録に後から追記していく使い方が多い(具体例1参照)一方、ルーティンは種目構成をその都度選び直すものという想定の違いが、同じ「削除済みの種目をどう扱うか」という問いへの答えを分けている
- **所有者チェックと状態チェックを1つのクエリに畳み込むと、区別しなくてよい404が自然に増える** — DELETE `/exercises/:id`の`findFirst`は「他人の種目」「公式種目」「削除済みの種目」「存在しないID」の4パターンを区別せず同じ404にする。具体例3・7のIDOR対策(存在を隠す404)と同じ形を、削除状態のチェックにもそのまま流用している

## 具体例12：新規登録するとき

もう1つの例として、[`backend/src/routes/auth.ts`](../../backend/src/routes/auth.ts)のPOST `/auth/register`を追う。具体例2で読んだログインの「入口」にあたる処理で、「登録できるとログイン状態になる」わけではない、という一見当たり前に見える設計が実際どう実装されているかを見る。

### 1. まず動かしてみる

`backend`を`npm run dev`で起動した状態で試す。

```bash
curl -i -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@example.com","password":"password123","displayName":"新規太郎","birthYearMonth":{"year":2000,"month":5},"gender":"male","occupation":"student"}'
```

```json
HTTP/1.1 201 Created
{"id":"...","email":"newuser@example.com","displayName":"新規太郎"}
```

ここで3つ試してほしい。

- **登録直後に(Cookieを付けずに)`/auth/me`を叩く** → `curl http://localhost:3001/auth/me`は`401 {"error":"unauthenticated"}`。登録リクエスト自体はCookieを発行しないため、ここまでの具体例のような`-c cookie.txt`を付けても意味が無い(`Set-Cookie`が返らない)。「登録できた」と「ログインした」は別の状態であることが、この401からわかる
- **同じメールアドレスでもう一度登録する** → `409 {"error":"email_already_registered"}`。具体例2のログインでは「メールアドレスが存在しない」と「パスワードが違う」を区別しない列挙対策があったが、登録APIでは逆に「既に使われているか」をはっきり伝えている。この違いがなぜ問題ないかを次で追う
- **パスワードを7文字(`"short12"`)にして送る** → `400`で、`details.properties.password.errors`に「文字数が足りない」旨のメッセージが入る

### 2. コードを実行順に追う

```ts
const birthYearMonthSchema = z.union([
  z.literal('no_answer'),
  z.object({
    year: z.number().int().min(1900).max(new Date().getFullYear()),
    month: z.number().int().min(1).max(12),
  }),
])

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
  displayName: z.string().trim().min(1).max(50),
  birthYearMonth: birthYearMonthSchema,
  gender: z.enum(['male', 'female', 'other', 'no_answer']),
  occupation: z.enum([/* ...7種類、'no_answer'を含む... */]),
})

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) { /* 400 */ }
  const { email, password, displayName, birthYearMonth, gender, occupation } = parsed.data

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    res.status(409).json({ error: 'email_already_registered' })
    return
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS)
  const birthDate =
    birthYearMonth === 'no_answer'
      ? null
      : new Date(Date.UTC(birthYearMonth.year, birthYearMonth.month - 1, 1))

  const user = await prisma.user.create({
    data: { email, passwordHash, displayName, birthDate, gender, occupation },
  })

  res.status(201).json({ id: user.id, email: user.email, displayName: user.displayName })
})
```

| ステップ | 何が起きるか | このときの値 |
|---|---|---|
| ① `registerSchema.safeParse(req.body)` | `birthYearMonth`は`z.union([...])`で「`'no_answer'`というリテラル」か「`{year, month}`のオブジェクト」のどちらかだけを許す。`password`は7文字だとここで弾かれる(curlで見た400の正体) | `parsed.data.birthYearMonth`は`{year:2000, month:5}` |
| ② `prisma.user.findUnique({ where: { email } })` | 具体例2のログインと同じ`findUnique`だが、ここでは結果をそのまま使う(ダミーハッシュ比較のような時間差対策はしていない) | 2回目の登録では`existingUser`が見つかる |
| ③ `if (existingUser)` | 見つかれば409。curlで見た「既に登録済み」の正体はここ。なぜここは列挙対策の対象外なのかは、後述の「具体例12から読み取れる設計上の判断」で扱う | (2回目のみ到達) |
| ④ `bcrypt.hash(password, BCRYPT_SALT_ROUNDS)` | ログイン時の`bcrypt.compare`(具体例2)と対になるハッシュ化。生のパスワードはここから先DBにもレスポンスにも一切現れない | - |
| ⑤ `birthDate`の変換 | `birthYearMonth`が`'no_answer'`なら`null`、それ以外なら`Date.UTC(year, month - 1, 1)`で「その月の1日」の`Date`に変換して保存する。JavaScriptの`Date`は月を0始まり(1月=0)で扱うため、フォームの「5月」をそのまま渡すと6月になってしまう。`month - 1`はその調整 | `{year:2000, month:5}` → `2000-05-01T00:00:00.000Z` |
| ⑥ `prisma.user.create(...)` | ここで初めてDBにINSERTが発行される。`req.session`には一切触れていない点に注目 — 具体例2のログインが`req.session.regenerate()`・`req.session.userId = user.id`を呼ぶのに対し、登録処理はセッションを作らない。curlで見た「登録直後の`/auth/me`が401」の正体はここ(何も作っていないので当然ログイン状態にならない) | 新しい`user`行 |
| ⑦ `res.status(201).json({...})` | `passwordHash`はもちろん、`birthDate`・`gender`・`occupation`も含めずレスポンスを返す。ログイン(具体例2)のレスポンスが`gender`を含むのとは違う点(呼び出し元がフロントの登録フォームの次の画面遷移で必要とする情報が少ないため) | - |

### 3. 自分で壊して確かめる

- `registerSchema`の`displayName: z.string().trim().min(1).max(50)`から一時的に`.trim()`を外して保存する(`tsx watch`が自動再起動)。その状態で表示名に空白だけの文字列(`"   "`)を送ると、本来`400`になるはずが`201`で登録できてしまい、空白だけの表示名を持つユーザーが作れてしまう。**試したら必ず元に戻すこと**
- `birthDate`の変換式`Date.UTC(birthYearMonth.year, birthYearMonth.month - 1, 1)`から一時的に`- 1`を外して`birthYearMonth.month`だけにして保存する。5月を選んで登録すると、実際には6月の1日として保存されてしまう(レスポンス・`/auth/me`のどちらにも`birthDate`は含まれないため、この違いはAPIの外からは直接見えない。DBの値を直接見るか、`docs/schema.md`のテーブル定義と突き合わせないと気づけないバグになる、という点も含めて体感できる)。**試したら必ず元に戻すこと**

## 具体例12から読み取れる設計上の判断

- **「存在するかどうか」を隠すかどうかは、APIの目的で決める** — 具体例2のログインは列挙対策として「存在しない」と「パスワードが違う」を同じ401にまとめるが、登録APIの409はその対象外で、はっきり「このメールアドレスは既に使われている」と伝える。ユーザーが登録フォームでメールアドレスの入力ミスに気づけないと不便な一方、ログイン画面での列挙対策は既に別途効いているため(具体例2)、登録側まで隠す必要はないという判断(コード中のコメント・`docs/schema.md`「セキュリティ実装の優先度」参照)
- **「作成できた」と「ログイン状態になった」を分離する** — `POST /auth/register`は`req.session`に一切触れない。ログイン状態への遷移は具体例2の`POST /auth/login`が担う。1つのAPIが2つの意味(アカウント作成とログイン)を持たないようにすることで、それぞれの処理(パスワード再ハッシュ化の有無、レート制限の要否など)を独立に変更しやすくしている。実際にログイン専用の`loginRateLimiter`(具体例2)は登録には付いていない
- **UIの入力単位とDBの保存単位が違うときは、変換の境界を1箇所に集める** — フォームの「年」「月」の2つの選択欄を`birthYearMonth`という1つのオブジェクトとしてバリデーションし、DBの`birthDate`(日付型・日は1日固定)への変換をハンドラー内の1箇所(`Date.UTC(...)`)に集約している。変換ロジックが散らばっていないため、「月を0始まりで渡す」というJavaScriptの`Date`特有の癖への対応も1箇所直せばよい

## 具体例13：自己ベスト更新・通算の節目・久しぶりの復帰を判定するとき

もう1つの例として、[`backend/src/routes/workouts.ts`](../../backend/src/routes/workouts.ts)の`evaluatePersonalBest()`・`evaluateAchievements()`を追う。具体例6は「保存はその場で行うが、表示するかどうかは後から判定する」という**取得側**の仕組みだったが、こちらは対になる**保存側**の話：セットを保存した瞬間に「これは自己ベストか」「通算日数の節目か」「久しぶりの復帰か」を判定し、①仲間への通知(`personal_best`・`milestone`・`comeback`。表示の遅延・再確認は具体例6と同じ`DELAYED_TYPES`の仕組みをそのまま使う)と、②保存APIの応答に載せて返す本人向けのその場の表示、という**2つの宛先**に振り分ける。

### 1. まず動かしてみる

`backend`を`npm run dev`で起動した状態で試す。アカウントが無ければ具体例1の手順で`test@example.com`を作成しログインしておく(`cookie.txt`を使う)。`<benchId>`は具体例5と同じく`curl -b cookie.txt http://localhost:3001/exercises`のレスポンスから`"name":"ベンチプレス"`の`id`を控える。

まず、十分に古い日付で1件目の記録を作る(自己ベストの「比べる相手」を用意するため)。

```bash
curl -s -X POST http://localhost:3001/workouts \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"performedAt": "2024-01-01"}'
# => {"id":"<workout1Id>", ...}

curl -s -X POST http://localhost:3001/workouts/<workout1Id>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<benchId>","weightKg":60,"reps":8}'
```

初めて記録する種目なので、`personalBest`は`null`、`achievements`も両方対象外になるはずだ。

```json
{"id":"...","workoutId":"...","exerciseId":"<benchId>","setOrder":1,"weightKg":60,"reps":8,
 "workoutExercise":{"id":"...","workoutId":"...","exerciseId":"<benchId>","sortOrder":1},
 "personalBest": null,
 "achievements": {"milestoneDays": null, "comeback": false}}
```

次に、別の日付(まだ「今日」ではない、十分離れた日付)で2件目の記録を作り、さっきより重い重量を記録する。

```bash
curl -s -X POST http://localhost:3001/workouts \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"performedAt": "2024-01-10"}'
# => {"id":"<workout2Id>", ...}

curl -s -X POST http://localhost:3001/workouts/<workout2Id>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<benchId>","weightKg":65,"reps":5}'
```

今度は`personalBest`が返ってくるはずだ(`previousBestKg`は1件目の`60`)。

```json
{"id":"...","workoutId":"...","exerciseId":"<benchId>","setOrder":1,"weightKg":65,"reps":5,
 "workoutExercise":{"id":"...","workoutId":"...","exerciseId":"<benchId>","sortOrder":1},
 "personalBest": {"exerciseId": "<benchId>", "weightKg": 65, "previousBestKg": 60},
 "achievements": {"milestoneDays": null, "comeback": false}}
```

最後に、**今日の日付**(タイムゾーンをJSTに指定した`date`コマンドで求める)で3件目の記録を作り、さらに重い重量を記録する。

```bash
today=$(TZ=Asia/Tokyo date +%Y-%m-%d)
curl -s -X POST http://localhost:3001/workouts \
  -H "Content-Type: application/json" -b cookie.txt \
  -d "{\"performedAt\": \"$today\"}"
# => {"id":"<workout3Id>", ...}

curl -s -X POST http://localhost:3001/workouts/<workout3Id>/sets \
  -H "Content-Type: application/json" -b cookie.txt \
  -d '{"exerciseId":"<benchId>","weightKg":70,"reps":3}'
```

`personalBest`は引き続き更新される(`previousBestKg`は今度の直近ベスト`65`)一方、`achievements.comeback`が**`true`**に変わるはずだ(実際に試すとそうなる)。

```json
{"id":"...","workoutId":"...","exerciseId":"<benchId>","setOrder":1,"weightKg":70,"reps":3,
 "workoutExercise":{"id":"...","workoutId":"...","exerciseId":"<benchId>","sortOrder":1},
 "personalBest": {"exerciseId": "<benchId>", "weightKg": 70, "previousBestKg": 65},
 "achievements": {"milestoneDays": null, "comeback": true}}
```

「1件目は比べる相手が無いので`null`」「2件目は自己ベストだが`comeback`は`false`」「3件目は自己ベストかつ`comeback`が`true`」という3通りの違いが、次のコードのどの分岐に対応するかを意識しながら読む。

### 2. コードを実行順に追う

まず自己ベスト判定(`evaluatePersonalBest`)。

```ts
async function evaluatePersonalBest(userId: string, set: WorkoutSetModel) {
  const weightKg = toWeightNumber(set.weightKg)
  if (weightKg === null) return null

  const [bestExceptThisSet, bestInOtherWorkouts] = await Promise.all([
    maxOwnWeight(userId, set.exerciseId, { setId: set.id }),
    maxOwnWeight(userId, set.exerciseId, { workoutId: set.workoutId }),
  ])

  if (bestInOtherWorkouts !== null && weightKg > bestInOtherWorkouts) {
    await notifyPersonalBest(userId, set.workoutId, set.exerciseId, bestInOtherWorkouts)
  }

  if (bestExceptThisSet === null || weightKg <= bestExceptThisSet) return null
  return { exerciseId: set.exerciseId, weightKg, previousBestKg: bestExceptThisSet }
}
```

| ステップ | 何が起きるか | このときの値(3件目・70kg保存時) |
|---|---|---|
| ① `toWeightNumber(set.weightKg)` | 自重セット(`weightKg: null`)はここで`null`を返して終了。自重種目が「自己ベスト」の対象外になっているのはここ | `70` |
| ② `bestExceptThisSet = maxOwnWeight(..., { setId: set.id })` | **このセット自身だけを除いた**自分の最大重量。同じ記録内の他のセットも含む | `65`(2件目の`65kg`。1件目の`60`より大きい方) |
| ③ `bestInOtherWorkouts = maxOwnWeight(..., { workoutId: set.workoutId })` | **この記録(workout)全体を除いた**、つまり別の日の記録だけでの自分の最大重量 | `65`(この時点で3件目のworkoutには他のセットが無いので②と同じ値になる) |
| ④ `if (bestInOtherWorkouts !== null && weightKg > bestInOtherWorkouts)` | 「別の日の記録」を上回っていれば、仲間への`personal_best`通知を作る(①の宛先) | `70 > 65` → 通知を作る |
| ⑤ `if (bestExceptThisSet === null \|\| weightKg <= bestExceptThisSet) return null` | 「このセット以外の全部」を上回っていなければ、本人向けの表示は無し(`return null`) | `70 > 65` → 条件に合わず通過 |
| ⑥ `return { exerciseId, weightKg, previousBestKg: bestExceptThisSet }` | 本人向けの表示内容を返す(②の宛先) | `{exerciseId: "<benchId>", weightKg: 70, previousBestKg: 65}` |

④(仲間への通知)と⑤⑥(本人への表示)が**別の基準**(`bestInOtherWorkouts` vs `bestExceptThisSet`)で判定されている点に注目してほしい。同じ記録の中で60kg→65kgと更新していった場合、仲間への通知は「別の日の記録」との比較なので1回しか作られない(`notifyPersonalBest`側にも同じ記録・同じ種目につき1件までという重複防止がある)一方、本人への表示は「セットを追加するたびに、それまでの自分の最高を更新したかどうか」を毎回返す、という設計。コード冒頭のコメントにも同じ説明がある。

次にC1(通算の節目)・C2(久しぶりの復帰)の判定(`evaluateAchievements`)。

```ts
async function evaluateAchievements(userId, workout, isFirstSetOfWorkout) {
  if (!isFirstSetOfWorkout) return { milestoneDays: null, comeback: false }

  const totalDays = await countDaysWithSets(userId)
  const milestoneDays = isMilestoneDayCount(totalDays) ? totalDays : null
  if (milestoneDays !== null) await notifyMilestone(userId, workout.id, milestoneDays)

  const performedAt = workout.performedAt.toISOString().slice(0, 10)
  const today = todayInJst()
  const yesterday = shiftDateString(today, -1)
  let comeback = false
  if (totalDays > 1 && (performedAt === today || performedAt === yesterday)) {
    const rangeStart = shiftDateString(performedAt, -14)
    const rangeEnd = shiftDateString(performedAt, 1)
    const otherDayInRange = await prisma.workout.findFirst({
      where: { userId, deletedAt: null, id: { not: workout.id }, sets: { some: {} },
        performedAt: { gte: new Date(`${rangeStart}T00:00:00Z`), lte: new Date(`${rangeEnd}T00:00:00Z`) } },
      select: { id: true },
    })
    comeback = otherDayInRange === null
  }
  if (comeback) await notifyComeback(userId, workout.id)
  return { milestoneDays, comeback }
}
```

| ステップ | 何が起きるか | このときの値(3件目) |
|---|---|---|
| ① `if (!isFirstSetOfWorkout) return ...` | この記録(workout)に**既にセットがあれば**即座に対象外を返す。curlの3件目で1セット目にしか達成が付かなかったのはこれが理由(2セット目以降を追加しても常に`null`/`false`になる) | 1セット目なので通過 |
| ② `countDaysWithSets(userId)` | セットが1件以上ある日付(workout)の総数。1ユーザー1日1workoutのため「日数」と「workout数」が一致する | `3`(1/1・1/10・今日) |
| ③ `isMilestoneDayCount(totalDays)` | `10・30・50・100の倍数・365`のいずれかでなければ`null`のまま | `3`は該当せず`milestoneDays: null` |
| ④ `today = todayInJst()` / `yesterday` | curlの2件目(`2024-01-10`)は`today`とも`yesterday`とも一致しないため、この時点で`comeback`は`false`のまま次に進まない。3件目(`$today`)は一致するので⑤に進む | `performedAt === today` → 一致 |
| ⑤ `rangeStart`〜`rangeEnd`の`findFirst` | 「`performedAt`の14日前から1日後まで」に、**この記録以外に**セットのある記録が無いかを探す | 1/1・1/10はどちらも今日から遠すぎるため範囲外 → `otherDayInRange === null` |
| ⑥ `comeback = otherDayInRange === null` | ⑤が見つからなければ`comeback: true` | `true` |

「前14日間**と翌日**」に翌日まで含めているのは、コード冒頭のコメントの通り「今日の分を記録した後に昨日の分を後入力する」という操作をしたときに同じ復帰が2回判定されるのを防ぐため(今日の記録が先にあれば、翌日=今日にあたる範囲に引っかかって2回目の判定が`false`になる)。

### 3. 自分で壊して確かめる

- `countDaysWithSets`で実際に9日分の履歴を作るのは大変なので、`isMilestoneDayCount`を一時的に`return true`だけにして保存する(`tsx watch`が自動再起動)。その状態で(新しいアカウントで)初めての記録を1件作ると、`milestoneDays`が`null`ではなく**`1`**で返ってくる(実際に試すとそうなる。`totalDays`が`1`の時点で「節目」判定が素通りするため)。`10`日目まで待たなくても、判定がどの値を見ているかが体感できる。**試したら必ず元に戻すこと**
- `evaluatePersonalBest`の`if (bestExceptThisSet === null || weightKg <= bestExceptThisSet) return null`を`if (bestExceptThisSet === null) return null`に変える(「今保存した重量が、それまでの自分の最高を上回っているか」の比較を外す)。その状態で、1つの記録の中で60kg→65kg→62kgと保存すると、本来3セット目(62kg)は`personalBest: null`のはずが、`{weightKg: 62, previousBestKg: 65}`が返ってきてしまう(実際に試すとそうなる)。「今回の重量が過去の自分を上回っていなければ、達成として表示しない」という前提が、この1行の比較(`weightKg <= bestExceptThisSet`)で支えられていることが体感できる。**試したら必ず元に戻すこと**

## 具体例13から読み取れる設計上の判断

- **「仲間への通知」と「本人への表示」は判定基準も届け方も別** — 同じ`evaluatePersonalBest()`の中で、仲間への通知(`bestInOtherWorkouts`基準・非同期に`notification`行を作るだけ)と本人への表示(`bestExceptThisSet`基準・保存APIの応答にその場で載せる)を分けて計算している。前者は具体例6の5分遅延の仕組みに乗るため「後から仲間が見る」、後者は「保存した本人が今まさに見る」という届くタイミングの違いがあり、基準が違うのもその違いを反映している
- **「初めての記録」「比べる相手が無い」は達成の条件そのものに埋め込む** — 自重種目(`weightKg === null`)・初めて記録した種目(`bestExceptThisSet === null`)・初めての記録(`totalDays`が節目に該当しない限り`milestoneDays`は`null`のまま)・初回記録(コード上`totalDays > 1`のガードで`comeback`は判定にすら入らない)は、どれも「エラーではないが対象外」を`null`/`false`で表現しており、具体例1〜4で見た「弾く」バリデーションとは違う種類の分岐
- **「1回のセット保存」の中に複数の宛先・複数の判定が同居する** — `POST /workouts/:id/sets`は1つのHTTPリクエストの中で、セットの保存(具体例1と同じ形)・自己ベスト判定(仲間向け通知＋本人向け応答)・C1/C2判定(同じく仲間向け通知＋本人向け応答)をすべて行う。それぞれが独立した関数(`evaluatePersonalBest`・`evaluateAchievements`)に分かれているため、ハンドラー本体(`workoutsRouter.post('/:id/sets', ...)`)を読むときは「何が起きるか」の一覧としてまず眺め、詳細は個別の関数を読みに行く、という2段階の読み方がしやすくなっている

## 具体例14：ワークアウト記録の一覧を取得するとき

対応するエンドポイントは[`backend/src/routes/workouts.ts`](../../backend/src/routes/workouts.ts)のGET `/workouts`。具体例1(1件作成)と対になる一覧取得だが、①一覧では`sets`本体を返さず「セットが1件以上あるか」(`hasSets`)だけを添える、②`performedAt`が日付のみ(時刻を持たない)なので同じ日に複数件あるときの並び順を別の列で保証する、という2つの独自ロジックを持つ。

### 1. まず動かしてみる

`backend`を`npm run dev`で起動し、具体例1の手順でログインしておく(`cookie.txt`)。

```bash
curl -s -b cookie.txt http://localhost:3001/workouts
# => []  （まだ1件も無ければ空配列）
```

ここが具体例1と違う最初のポイント：**同じ日付で2件**作ってみる。POST `/workouts`自体には「同じ日付なら弾く」というバリデーションが無いため、直接curlで送ればこれができる(フロントは通常この状況を作らない。後述)。

```bash
curl -s -b cookie.txt -X POST http://localhost:3001/workouts \
  -H "Content-Type: application/json" -d '{"performedAt":"2026-09-20","memo":"1st"}'
# => {"id":"<workout1Id>","performedAt":"2026-09-20","memo":"1st","hasSets":false,"createdAt":"...T15:51:08.350Z",...}

curl -s -b cookie.txt -X POST http://localhost:3001/workouts \
  -H "Content-Type: application/json" -d '{"performedAt":"2026-09-20","memo":"2nd"}'
# => {"id":"<workout2Id>","performedAt":"2026-09-20","memo":"2nd","hasSets":false,"createdAt":"...T15:51:09.414Z",...}
```

続けて一覧を取ると、**後から作った「2nd」が先頭**に来る。

```bash
curl -s -b cookie.txt http://localhost:3001/workouts
# => [{"id":"<workout2Id>",...,"memo":"2nd",...}, {"id":"<workout1Id>",...,"memo":"1st",...}]
```

最後に、`<workout1Id>`(1st)にセットを1件追加してから一覧を取り直す。`<benchId>`は具体例5と同じく`GET /exercises`のレスポンスから控える。

```bash
curl -s -b cookie.txt -X POST http://localhost:3001/workouts/<workout1Id>/sets \
  -H "Content-Type: application/json" -d '{"exerciseId":"<benchId>","weightKg":60,"reps":10}'

curl -s -b cookie.txt http://localhost:3001/workouts
# => [{"id":"<workout2Id>",...,"hasSets":false,...}, {"id":"<workout1Id>",...,"hasSets":true,...}]
```

`hasSets`が「1st」だけ`true`に変わる一方、**並び順(2nd→1st)は変わらない**。「セットの有無」と「並び順」が別の基準で決まっていることが、この2つを見比べるとわかる。

### 2. コードを実行順に追う

```ts
workoutsRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId! // requireAuthを通過済みのため必ず存在

  const workouts = await prisma.workout.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
    include: { _count: { select: { sets: true } } },
  })

  res.status(200).json(workouts.map((w) => serializeWorkout(w, w._count.sets > 0)))
})
```

| ステップ | 何が起きるか | このときの値(3回目のcurl実行後) |
|---|---|---|
| ① `where: { userId, deletedAt: null }` | 自分の、ソフトデリートされていない記録だけに絞る。具体例1の`findOwnWorkout`と同じ考え方だが、一覧なので`findFirst`ではなく`findMany` | 2件(1st・2nd) |
| ② `orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }]` | まず記録日の新しい順。**同じ`performedAt`の行同士は、次に`createdAt`の新しい順**で並べる(配列の2番目の要素が「1番目で同値だったときの決め手」になる、Prismaのタイブレーク指定の書き方) | どちらも`performedAt`は`2026-09-20`で同値 → `createdAt`(2nd:`15:51:09.414`＞1st:`15:51:08.350`)で2nd→1stの順 |
| ③ `include: { _count: { select: { sets: true } } }` | 各`workout`に、紐づく`WorkoutSet`の件数だけを`_count.sets`として添える。セット本体(`weightKg`・`reps`等)は取得しない | 1st:`_count.sets === 1`、2nd:`_count.sets === 0` |
| ④ `workouts.map((w) => serializeWorkout(w, w._count.sets > 0))` | ③の件数を`boolean`に変換して`hasSets`に渡す。具体例1で見た`serializeWorkout`の第2引数がここで使われている | 1st:`hasSets: true`、2nd:`hasSets: false` |

②と③④が独立した処理であることが、curlで見た「並び順は変わらないのに`hasSets`だけ変わった」の正体。②は`orderBy`(SQLの`ORDER BY performed_at DESC, created_at DESC`に相当)、③④は`_count`という別のクエリオプションで、互いに影響し合わない。

コード冒頭のコメント(`// performedAtは日付のみ...`)が、②の理由をそのまま説明している：`performedAt`は`@db.Date`(時刻を持たない、`docs/schema.md`参照)なので、同じ日に複数件あると`performedAt`だけでは順序が定まらない。`createdAt`(作成日時、ミリ秒まで持つ)をタイブレークに使うことで「同じ日の記録は新しく作った方が先」という順序を保証している。

### 3. 自分で壊して確かめる

- `orderBy`の2番目を`{ createdAt: 'desc' }`から`{ createdAt: 'asc' }`に変えて保存する(`tsx watch`が自動再起動)。その状態で(新しい日付で)同じ日に2件作ってから一覧を取ると、**さっきと逆に「先に作った方」が先頭に来る**(実際に試すとそうなる)。並び順を決めているのがこの1箇所だけであることが体感できる。**試したら必ず元に戻すこと**
- `include: { _count: { select: { sets: true } } }`ごと削除し、`serializeWorkout(w, false)`に固定して保存する。セットがある記録で一覧を取ると、`hasSets`が常に`false`になる(実際に試すとそうなる)。[frontend-guide.md具体例14](./frontend-guide.md)で見るように、これは②ホームのカレンダー印(セットがある日の塗りつぶし表示)が全部消えることに直結する。**試したら必ず元に戻すこと**

## 具体例14から読み取れる設計上の判断

- **「同じ日に複数件」を禁止せず、順序の保証で対応する** — `performedAt`の重複を防ぐDB制約・バリデーションはどこにも無い(フロントの通常操作では③「今日の記録を始める」が既存のworkoutを再利用するため起きにくいだけ)。その代わり一覧取得側が`createdAt`をタイブレークに使うことで、「同じ日が複数件あっても表示順は常に決まっている」という一貫性だけを保証する設計になっている
- **一覧は「有無」だけ、詳細は別リクエスト** — 一覧(`GET /workouts`)は`_count`で件数の有無しか返さず、セットの中身(`weightKg`・`reps`等)は返さない。中身が要る場面(②ホームの選択日の内訳)は[frontend-guide.md具体例14](./frontend-guide.md)で見るように`GET /workouts/:id`を都度呼ぶ設計になっており、一覧のペイロードを軽く保っている

## 次に読むと理解が深まるファイル

- `backend/src/routes/auth.ts`の`authRouter.post('/logout', ...)` — セッション破棄とCookie削除の流れ
- `backend/src/routes/notifications.ts`の`resolvePersonalBestTargets()`・`resolveAchievementTargets()` — 具体例6で扱った`member_joined`以外の遅延通知(具体例13の自己ベスト更新・通算の節目・久しぶりの復帰)の、取得側での再確認ロジック。`payload`(作成時点の値)と取得時点の値を突き合わせる分、`member_joined`より確認する項目が多い
- `backend/src/routes/workouts.ts`の`notifyCommentParticipants()` — 具体例7では触れなかった、コメントの投稿者本人だけでなく過去のコメント投稿者にも`comment_reply`として通知するスレッド参加者の集め方(Issue #149)
- `backend/src/routes/groups.ts`のGET `/groups/:id/ranking/default-exercise`・GET `/groups/:id/ranking/exercises` — 具体例8では触れなかった、種目別ランキングの種目セレクタまわり。前者は「直近28日で最もセット数が多い公式種目」を`groupBy`で求めて初期選択に使い、後者は「グループの誰かが記録したことのある公式種目」だけに絞った候補一覧を返す。どちらも同じ「表示順→名前順」のタイブレークを使う
- `backend/src/routes/auth.ts`の`authRouter.post('/password-changes', ...)` — 具体例9では扱わなかった、ログイン中にその場でパスワードを変える方の仕組み。現在のパスワードの照合(`bcrypt.compare`)を先に行う点、成功時に未使用のメールリセット用トークンも失効させる点が、トークンベースの再設定とは違う
- `backend/src/routes/workouts.ts`のGET `/workouts/:id` — 具体例14では触れなかった、1件分の詳細取得。`sets`のtie-break(`setOrder`→`createdAt`、Issue #226)と、種目カードの並び(`exercises`の`sortOrder`、Issue #228)が一覧には無いレスポンスとして加わる
- `docs/schema.md` — テーブル設計の背景・なぜセッション方式を選んだか
