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

## 次に読むと理解が深まるファイル

- `backend/src/routes/auth.ts`の`authRouter.post('/logout', ...)` — セッション破棄とCookie削除の流れ
- `backend/src/routes/groups.ts`の`POST /groups/join`(招待コードで参加する処理) — 定員超過・招待コード期限切れ・退会後の再参加といった分岐
- `docs/schema.md` — テーブル設計の背景・なぜセッション方式を選んだか
