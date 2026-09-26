# フロントエンドの歩き方

対象読者: このプロジェクトのコードを初めて読む人。Nuxt.js(Vue.js)の経験は問わない。

全体構成は [`architecture.md`](./architecture.md) を先に見ておくと理解しやすい。バックエンド側の対応する処理は [`backend-guide.md`](./backend-guide.md) で追っている。

> **このガイドを他の機能にも拡張するときの型(メモ)**：「具体例」の節は①まず動かして観察する(ブラウザのNetworkタブで実際にどのリクエストがいつ流れるかを見る) → ②コードを実行順に追う(観察した挙動がどの関数呼び出しに対応するかをトレースする) → ③自分で壊して確かめる、という順で書く。**書いたら必ず実際にブラウザで操作して検証してから確定させる**。このガイドは当初「セットを保存した瞬間にPOSTが流れる」と書いていたが、実際にブラウザ操作で確認したところ「種目を選んだ瞬間(保存ボタンは無い)」だったことが分かり、後から全面的に書き直した経緯がある。対象機能の棚卸しは[`docs/backlog.md`](../backlog.md)「開発者向けガイド(docs/dev/)の対象機能拡張」参照。

## ディレクトリの役割

```
frontend/app/
  pages/        -- URLと1対1で対応する画面(Nuxtのファイルベースルーティング)
  components/   -- 複数の画面で使い回すUI部品
  composables/  -- 画面をまたいで使うロジック・状態(useXxxという名前の関数)
  layouts/      -- ページ共通の外枠(ヘッダーなど)
  middleware/   -- ページ遷移の前処理(未ログイン時のリダイレクトなど)
  utils/        -- 純粋な補助関数
```

Nuxtでは`pages/workouts/new.vue`が自動的に`/workouts/new`というURLになる。「composable」はReactでいう独自Hookに近いもので、`use〇〇`という名前の関数としてロジックをまとめ、複数のページから呼び出す。

## 具体例1：ワークアウト記録を1件作るとき

[`backend-guide.md`](./backend-guide.md)で追ったPOST `/workouts`を、フロント側からどう呼んでいるかを見る。

### 1. まず動かして観察する

`frontend`と`backend`を両方`npm run dev`で起動する。アカウントが無ければ`http://localhost:3000/register`で作成し、ログイン後に`http://localhost:3000/workouts/new`を開く。ブラウザの開発者ツール(Network タブ)を開いた状態で、「＋種目を追加」から種目を1つ選んでみる。

観察してほしいのはタイミングだ。**このアプリには「セットを保存」ボタンは無い**ので、どこで初めてサーバーにデータが送られるのかを意識しながら操作する。

- **ページを開いた直後** → Networkタブに`POST /api/workouts`は**流れていない**(一覧取得の`GET /api/workouts`だけが流れる)
- **種目選択画面で種目名をタップした瞬間** → 画面が`/workouts/new`に自動で戻ると同時に、`POST /api/workouts`と`POST /api/workouts/:id/sets`が続けて流れる。戻ってきた画面には既に「回数10」が入ったセットが1件表示されている

つまり、**重量・回数を自分で入力する前に、最初のセットは既に(デフォルト値で)サーバーに保存されている**。この後で重量や回数の欄を編集すると、今度は`PATCH /api/workouts/:id/sets/:setId`が飛ぶ(欄からフォーカスを外す＝blurしたタイミング)。「保存ボタンを押す」という操作自体がこのアプリには無い、というのがまず押さえておくべき事実。なぜ種目選択の時点でここまで自動的に保存されるのか、次でコードから確認する。

### 2. ページからcomposableを呼ぶ

[`frontend/app/pages/workouts/new.vue`](../../frontend/app/pages/workouts/new.vue)は、画面表示時と種目選択後の2つのタイミングで、それぞれ[`useWorkoutSession()`](../../frontend/app/composables/useWorkoutSession.ts)が返す関数を呼んでいる。

```ts
const { startWorkout, addSet /* ... */ } = useWorkoutSession()

await startWorkout(targetDate) // ページを開いたときに1回だけ呼ぶ

// 種目選択画面から戻ってきた直後、選ばれた種目の1セット目をデフォルト値で即追加する
if (initialPickedExerciseId) {
  await onAddSet(initialPickedExerciseId) // 内部でaddSet(exerciseId, reps, weightKg)を呼ぶ
}
```

- `startWorkout()` — ページ表示時に呼ばれる。「その日の記録が既にあればそのIDを覚えておく、無ければ`workoutId: null`のまま」という初期化だけを行う(まだPOSTはしない)
- `onAddSet()`(`new.vue`内の関数) → `addSet(exerciseId, reps, weightKg)` — 種目選択画面([`pages/workouts/exercises.vue`](../../frontend/app/pages/workouts/exercises.vue))で種目をタップして`new.vue`に戻ってきた直後に、デフォルト値(回数10など)で自動的に呼ばれる。この内部で`ensureWorkout()`という関数が呼ばれ、そこで初めてPOSTが発生する。次でその中身を見る

### 3. コードを実行順に追う

`addSet()`が内部で呼んでいる[`ensureWorkout()`](../../frontend/app/composables/useWorkoutSession.ts)がPOSTの本体。

```ts
async function ensureWorkout() {
  if (session.value.workoutId) return session.value.workoutId
  if (!session.value.performedAt) throw new Error('記録日が未設定です')

  const workout = await requestFetch<{ id: string; memo: string | null }>('/api/workouts', {
    method: 'POST',
    body: { performedAt: session.value.performedAt },
  })
  session.value.workoutId = workout.id
  session.value.memo = workout.memo
  return workout.id
}
```

`session`は後述する`useState`で作られた値で、`.value`を付けて中身を読み書きする(Vueの`ref`と同じ考え方。「箱の中身にアクセスする」ための書き方だと思えばよい)。

さっき観察した「種目を選んだ瞬間にPOSTが流れる」という挙動を、この関数の中で追う。

| ステップ | 何が起きるか |
|---|---|
| ① 種目選択画面で種目をタップし`new.vue`に戻ると`onAddSet()`→`addSet()`→`ensureWorkout()`が呼ばれる | その日最初のセットの場合、まだ`session.value.workoutId`は`null` |
| ② `if (session.value.workoutId) return ...` | `null`なのでこの分岐はスキップされる(2個目以降のセットではここで即returnし、POSTは発生しない) |
| ③ `requestFetch('/api/workouts', { method: 'POST', ... })` | ここで初めて`POST /api/workouts`が発行される。Networkタブで見えたのはこの瞬間 |
| ④ `session.value.workoutId = workout.id` | 以降は②で即returnするようになる |

「ページを開いた時点ではPOSTしない」のは、`ensureWorkout()`が`addSet()`のような**実際に何かを保存する操作の内部だけ**から呼ばれ、`startWorkout()`(ページ表示時)からは呼ばれないから。もし「開いただけで自動的にworkoutを作る」実装だったら、種目を選ばずに離脱したときに空の記録が残ってしまう。この設計判断はコード中のコメントにも書かれている。

ここで押さえるポイント：

- **`/api/workouts`が本物のバックエンドURLではない** — [`frontend/nuxt.config.ts`](../../frontend/nuxt.config.ts)の`routeRules`で`/api/**`をbackendのオリジン(ローカルなら`http://localhost:3001`)にプロキシしている。フロントのコードはbackendの実際のURLを知らなくてよい
- **`requestFetch`(`useRequestFetch()`)を使う** — 素の`$fetch`ではなく`useRequestFetch()`で取得した関数を使っている。理由はSSR(サーバーサイドレンダリング。ページの初期HTMLをサーバー側で組み立てる仕組み)時にブラウザから来たCookieを転送するため。これを使わないと、SSR中のリクエストがログイン済みと判定されないことがある

### 4. 自分で壊して確かめる

フロントはVite(Nuxtの内部エンジン)のHMRが効くので、ファイルを保存すればブラウザは自動で更新される。手動リロードや再起動は不要。

- `ensureWorkout()`の`if (session.value.workoutId) return session.value.workoutId`を一時的にコメントアウトして保存し、種目を2つ選んでみる(1つ目を選んだ後、続けて「＋種目を追加」から2つ目を選ぶ) → `POST /api/workouts`が2回流れ、backend側で同じ日のworkoutが重複作成されるはず(実際には`workouts.ts`側に日付の重複防止までは無いため、UI上おかしな挙動になる)。この1行が何を防いでいるかが体感できる
- Networkタブを見ながら、種目を1つも選ばずに`/workouts`一覧ページに戻ってみる → `POST /api/workouts`が発生していないことを確認する。「ページを開いただけでは記録が残らない」という仕様がここで担保されている(種目を選んだ時点で初めて記録が作られる、という1で観察した挙動の裏返し)

試したら元に戻すこと。

### 5. 状態はuseStateで画面をまたいで保持する

`useWorkoutSession`内の`session`は`useState('workout-session', () => ({...}))`で作られている。これはNuxtが提供する仕組みで、同じキー(`'workout-session'`)を指定すれば、別のページに遷移してcomposableが再度呼ばれても同じ状態を参照できる。トレ部では「種目選択画面へ行って戻ってくる」といった画面遷移を挟む操作が多いため、この仕組みで記録の進行中状態を保っている。

ここで実際に確かめておきたい重要な性質がある。

- **アプリ内のリンク・ボタンで画面遷移する(SPA内遷移)と状態は保持される** — 種目選択画面へ移動して戻っても、それまで登録したセットの状態は保たれる
- **ブラウザの再読み込み(フルリロード)やURLを直接ペーストして開くと状態は消える** — `useState`はメモリ上の状態なので、ページを新しく読み込み直すとリセットされる

この2つの動作の違いを実際に試してみてほしい。この区別は些細に見えて、実は動作確認のときに落とし穴になる。「アプリ内のリンクをクリックして遷移する」確認と「URLバーに直接ページを打ち込んで開く(フルリロード相当)」確認では、`useState`のキャッシュが古いままかどうかの見え方が変わってしまうことがある(詳しくは[プロジェクトのCLAUDE.md](../../CLAUDE.md)のセルフチェック項目を参照。Issue #116で実際に踏んだ問題)。

## 具体例1から読み取れる設計上の判断

- **API呼び出しは`pages/`に直接書かず、composableに集約する** — ページ(`.vue`)はUIの表示とユーザー操作のハンドリングに専念し、「何を・いつAPIに送るか」のロジックはcomposable側が持つ。同じデータを複数の画面で使う場合に重複を避けられる
- **キャッシュの更新漏れに注意する** — `useWorkouts()`のような一覧データを`useState`でキャッシュしている箇所は、保存操作のたびに変わりうる値(前回実績・集計値など)を持たせると、更新処理を書き忘れたときにページ遷移後も古い値が残り続けるバグになりやすい(過去にIssue #116で発覚した)。新しくcomposableを書くときはこの点を意識する

## 具体例2：ログインしてセッションを確立するとき

[`backend-guide.md`](./backend-guide.md)で追ったPOST `/auth/login`を、フロント側からどう呼んでいるかを見る。ログイン状態を画面ごとにどう出し分けているか([`frontend/app/middleware/`](../../frontend/app/middleware/)のガード)も合わせて扱う。

### 1. まず動かして観察する

`frontend`と`backend`を両方`npm run dev`で起動する。ログイン済みならヘッダーの「ログアウト」から一旦ログアウトしておく。Networkタブを開いた状態で`http://localhost:3000/login`を開き、メールアドレス・パスワードを入力して「ログイン」を押す。

- **ログインボタンを押した瞬間** → `POST /api/auth/login`が流れ、`200`でユーザー情報(`id`・`email`・`displayName`・`gender`)が返る。この直後に画面は`/`へ遷移する
- **`/`に遷移した直後** → 何も追加のリクエストは流れない。ログイン画面のフォームで受け取ったレスポンスだけでヘッダーの表示名等が更新されている

次に、ログイン済みの状態で`http://localhost:3000/login`をアプリ内リンクではなく直接URLバーに入力して開いてみる(フルリロード) → **`/login`にはとどまらず`/`へ自動的に戻される**。逆にログアウトした状態で`http://localhost:3000/routines`を直接開く → **`/login`へ戻される**。この2つの「勝手にリダイレクトされる」挙動がどこで起きているかを、次でコードから確認する。

### 2. コードを実行順に追う

ログインフォームの送信は[`frontend/app/pages/login.vue`](../../frontend/app/pages/login.vue)から[`useAuth()`](../../frontend/app/composables/useAuth.ts)の`login()`を呼ぶだけ。

```ts
// login.vue
async function onSubmit() {
  try {
    await login({ email: email.value, password: password.value })
    await navigateTo('/')
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  }
}
```

```ts
// useAuth.ts
async function login(payload: LoginPayload) {
  user.value = await $fetch<AuthUser>('/api/auth/login', { method: 'POST', body: payload })
  return user.value
}
```

| ステップ | 何が起きるか |
|---|---|
| ① `login()`を呼ぶ | `$fetch('/api/auth/login', ...)`が発行される。Networkタブで見えたのはこの瞬間 |
| ② `user.value = await $fetch(...)` | ログインAPIのレスポンス(`{id, email, displayName, gender}`)を、`useState`で管理している`user`にそのまま代入する。この時点でヘッダー等、`user`を参照している箇所は全て更新済みになる |
| ③ 失敗時(401等) | `$fetch`が例外を投げるので`catch`に落ち、[`authErrorMessage()`](../../frontend/app/composables/useAuth.ts)がbackendのエラーコード(`invalid_credentials`など。[backend-guide.md](./backend-guide.md)参照)を日本語メッセージに変換する |
| ④ `await navigateTo('/')` | `user.value`が既に②で入っているので、SPA内遷移した`/`は追加のAPI呼び出し無しでログイン後の見た目になる |

「`/`に遷移した直後は何も追加のリクエストが流れない」のは、`login()`が`user.value`に直接レスポンスを代入しているから。ここで押さえておきたいのは、[`frontend/app/pages/index.vue`](../../frontend/app/pages/index.vue)自身に`if (!user.value) { await fetchMe() }`という保険のコードがあることだ。**もし`login()`が`user.value`を更新し忘れていても、`/`のこの保険により`GET /api/auth/me`が呼ばれて結局は正しいログイン状態が表示される**(3で実際に確かめる)。「/」は`auth`ミドルウェアを使わず未ログイン時もページ自体は表示する設計(未ログインなら`WelcomeScreen`、ログイン中なら`HomeScreen`)なので、この判定はミドルウェアではなくページ側に書かれている。

一方、`/login`や`/routines`のような他のページは`definePageMeta({ middleware: 'guest' })` / `{ middleware: 'auth' }`で保護されている。

```ts
// middleware/auth.ts(ログイン必須ページ用)
export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchMe } = useAuth()
  if (!user.value) {
    await fetchMe()
  }
  if (!user.value) {
    return navigateTo('/login')
  }
})
```

```ts
// middleware/guest.ts(未ログイン専用ページ用)
export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchMe } = useAuth()
  if (!user.value) {
    await fetchMe()
  }
  if (user.value) {
    return navigateTo('/')
  }
})
```

`auth`と`guest`はほぼ同じ形で、`fetchMe()`で(必要なら)最新のログイン状態を取得してから、条件が逆向きのリダイレクトをするだけの違い。ログイン中に`/login`を直接開くと`guest`ミドルウェアが`user.value`ありと判定して`/`へ戻し、未ログインで`/routines`を開くと`auth`ミドルウェアが`user.value`無しと判定して`/login`へ戻す。これがさっき観察した2つのリダイレクトの正体。

### 3. 自分で壊して確かめる

- `useAuth.ts`の`login()`を一時的に次のように変え、`user.value`への代入をやめてみる。

  ```ts
  async function login(payload: LoginPayload) {
    const loggedInUser = await $fetch<AuthUser>('/api/auth/login', { method: 'POST', body: payload })
    return loggedInUser
  }
  ```

  この状態でログインすると、見た目には**ログインは成功しヘッダーも正しく表示される**(エラーにはならない)。ただしNetworkタブをよく見ると、ログイン成功後に`GET /api/auth/me`が追加でもう1回流れているはずだ。これは2で説明した`index.vue`の保険(`if (!user.value) { await fetchMe() }`)が代わりに動いているから。つまりこの1行を消しても`/`では気づきにくいが、「ログインのレスポンスを使わず、わざわざもう1回サーバーに問い合わせている」という無駄が生まれている。試したら元に戻すこと
- `middleware/auth.ts`の`return navigateTo('/login')`を一時的にコメントアウトして保存し、ログアウトした状態で`/routines`を開いてみる → リダイレクトされずに`/routines`のページ自体は表示されてしまう。ただし中の`GET /api/routines`は`backend`側の`requireAuth`で`401`になるため、画面には「ルーティン一覧の取得に失敗しました。時間をおいて再度お試しください」というエラーメッセージが出る。フロント側のガードとバックエンド側の`requireAuth`(具体例1参照)は別々の仕組みで、フロント側を外してもバックエンド側が最後の砦として残ることが体感できる(ただし本来リダイレクトされるべき画面がエラー表示のまま出てしまうこと自体はUX上望ましくないので、フロント側のガードも省略はできない)。試したら元に戻すこと

## 具体例2から読み取れる設計上の判断

- **ログインのレスポンスをそのまま状態に使う** — ログイン成功後に改めて`/auth/me`を呼び直さず、`login()`のレスポンスをそのまま`user`に入れることでリクエスト回数を減らしている。ただし`/`のように別経路で`fetchMe()`を呼ぶ保険が入っている画面もあるため、「必ず`login()`経由でしか`user`が埋まらない」という前提はしない方がよい
- **画面ごとのガードは`middleware`に集約する** — 「ログイン必須」「未ログイン専用」をページの`.vue`ファイルに書かず、`definePageMeta({ middleware: 'auth' | 'guest' })`で指定する形にすることで、そのページがどちらの制約を受けるかが宣言部分を見るだけでわかる。ただし「/」のようにどちらのミドルウェアも使わず、ページ自身がログイン状態で表示を出し分ける設計もある(Issue #151。全ページ一律ではない点に注意)

## 具体例3：グループの権限をフロントでどう扱うか

[`backend-guide.md`](./backend-guide.md)で追ったGET `/groups/:id`・DELETE `/groups/:id`の404/403を、フロント側がどう見せているかを見る。対象は[`frontend/app/pages/groups/[id]/index.vue`](../../frontend/app/pages/groups/[id]/index.vue)(グループ詳細画面)。

### 1. まず動かして観察する

具体例1・2と同様、`test@example.com`(A、オーナー)ともう1アカウント(B、招待コードで参加させたメンバー)をブラウザから作っておく。Aでログインし、`/groups/<groupId>`(グループ詳細)を開く。

- **Aで開いたとき** → 画面上部に「オーナー」バッジが表示され、「招待コードの再発行」ボタンと「このグループを削除する」ボタンが両方とも見える
- **ログアウトしてBでログインし直し、同じ`/groups/<groupId>`を開いたとき** → 「オーナー」バッジは無く、「再発行」「削除」ボタンごと画面に存在しない(グレーアウトではなく、要素自体が無い)。「このグループを退会する」ボタンだけが見える

つまり、B(メンバー)はそもそも削除・再発行のボタンをクリックできる状態にすら到達しない。バックエンドがBからのDELETEを403で弾く([backend-guide.md](./backend-guide.md)具体例3参照)のに対し、フロントはその手前でボタンごと隠している。この「見せない」判定がどこで行われているかを次で追う。

### 2. コードを実行順に追う

```ts
// pages/groups/[id]/index.vue
const group = ref<Awaited<ReturnType<typeof fetchGroupDetail>> | null>(null)

async function load() {
  try {
    group.value = await fetchGroupDetail(groupId) // GET /api/groups/:id
  } catch {
    loadError.value = true
  }
}

const isOwner = computed(() => group.value?.role === 'owner')
```

```html
<button v-if="isOwner" @click="onReissueInvite">再発行</button>
...
<button v-if="isOwner" @click="onDelete">このグループを削除する</button>
```

| ステップ | 何が起きるか |
|---|---|
| ① `fetchGroupDetail(groupId)` | `GET /api/groups/:id`を呼ぶ。バックエンド([backend-guide.md](./backend-guide.md)具体例3参照)は`findActiveMembership()`で所属を確認し、所属していれば`role`(`'owner'`か`'member'`)を含めてレスポンスを返す |
| ② `group.value = await fetchGroupDetail(...)` | レスポンスの`role`がそのまま`group.value.role`に入る。Aなら`'owner'`、Bなら`'member'` |
| ③ `isOwner = computed(() => group.value?.role === 'owner')` | ①②で得た`role`を見て真偽値に変換するだけの薄いcomputed |
| ④ `v-if="isOwner"` | テンプレート側で`isOwner`が`false`のときはボタンのDOM自体を描画しない(非表示ではなく不存在) |

**バックエンドの`role`をそのまま信じている**点がポイント。フロント側で「オーナーかどうか」を独自に再計算するロジックは無く、APIレスポンスの`role`フィールドを渡しているだけ。もしBが未所属のグループ(Cの立場)のURLを直接開いたら、`fetchGroupDetail`が`404`で失敗して`catch`に落ち、`loadError.value = true`になる。この画面の`loadError`は「グループの取得に失敗しました。時間をおいて再度お試しください」という汎用メッセージで、404(権限が無い)と500(サーバーエラー)を区別しない実装になっている。認可エラー専用のメッセージは用意していない。

### 3. 自分で壊して確かめる

- `isOwner`の定義を一時的に`const isOwner = computed(() => true)`に変えて保存する(HMRで即反映)。Bでログインした状態で`/groups/<groupId>`を開き直すと、メンバーのはずなのに「再発行」「削除」ボタンが見えてしまう。ただしボタンを実際に押すと、`DELETE /api/groups/:id`がバックエンドの`403 forbidden`で弾かれ、`groupErrorMessage()`が「この操作はオーナーのみ行えます」という日本語メッセージに変換して画面に出す(`onDelete`の`catch`)。**フロントのボタン非表示はあくまでUX上の配慮で、実際の権限はバックエンドの`membership.role !== 'owner'`チェックが最後の砦になっている**ことが体感できる(具体例2で見た`middleware/auth.ts`とバックエンドの`requireAuth`の関係と同じ構図)。試したら元に戻すこと

## 具体例3から読み取れる設計上の判断

- **権限の判定結果(`role`)はバックエンドの値をそのまま使う** — フロントは「オーナーかどうか」を独自ロジックで判定し直さず、APIレスポンスの`role`フィールドを`computed`で真偽値に変換するだけ。判定ロジックの二重管理を避けている
- **操作できないボタンは「隠す」、操作した結果の権限エラーは「汎用メッセージ」** — オーナー限定の操作はそもそもボタンを出さない(`v-if`)ことでミスクリックを防ぎつつ、直接APIを叩かれた場合(上の「3. 自分で壊して確かめる」参照)の403は個別の丁寧なメッセージ(`groupErrorMessage()`のマップ)で返す。一方、閲覧系(グループ詳細の取得自体)の404は個別扱いせず汎用エラーメッセージにまとめている。「操作の失敗は具体的に」「閲覧の失敗は汎用的に」という向きの違いがある

## 具体例4：ルーティンで種目を追加すると目安セットが即登録される

[`backend-guide.md`](./backend-guide.md)具体例4で追ったPOST `/routines/:id/exercises`・PATCH `/routines/:id/exercises/:routineExerciseId`を、フロント側からどう呼んでいるかを見る。対象は[`frontend/app/pages/routines/[id].vue`](../../frontend/app/pages/routines/[id].vue)(ルーティン編集画面)。具体例1で見た「種目を選んだ瞬間にデフォルト値で保存される」設計が、ワークアウト記録作成とは別の画面にも同じ形で現れている例になっている。

### 1. まず動かして観察する

`frontend`と`backend`を両方`npm run dev`で起動する。ログイン後、`/routines`を開き「新しいルーティン名」に何か入力して「追加」を押す(ルーティン編集画面に遷移する)。Networkタブを開いた状態で、「＋種目を追加」から種目を1つ選んでみる。

- **種目名をタップした瞬間** → 画面が`/routines/<id>`へ自動で戻ると同時に、`POST /api/routines/<id>/exercises`と`PATCH /api/routines/<id>/exercises/<routineExerciseId>`が続けて流れる。戻ってきた画面には既に「回数10」が入った目安セットが1件表示されている

具体例1の「種目を選んだ瞬間に`POST /api/workouts`と`POST /api/workouts/:id/sets`が続けて流れる」のと全く同じ構図で、ここでは「`POST`(種目をルーティンに追加)→`PATCH`(目安セット1件をデフォルト値で保存)」という2段の自動保存になっている。

### 2. コードを実行順に追う

種目選択画面([`pages/workouts/exercises.vue`](../../frontend/app/pages/workouts/exercises.vue))で種目をタップすると`returnTo`パラメータの画面(ここでは`/routines/<id>`)に戻り、`routines/[id].vue`のスクリプト先頭付近にあるこの分岐が実行される。

```ts
// ④種目選択・⑦種目追加(returnTo=このページ)から選ばれた種目を、戻ってきたタイミングで追加する
const pickedExerciseId = usePickedExerciseId()
if (pickedExerciseId.value) {
  const exerciseId = pickedExerciseId.value
  pickedExerciseId.value = null
  try {
    await addExercise(exerciseId)
  } catch {
    exerciseError.value = '種目の追加に失敗しました。時間をおいて再度お試しください'
  }
}
```

`addExercise()`の中身。

```ts
async function addExercise(exerciseId: string) {
  if (!routine.value) return
  if (routine.value.exercises.some((e) => e.exerciseId === exerciseId)) {
    exerciseError.value = 'この種目はすでに追加されています'
    return
  }
  const nextSortOrder = /* ... */
  const created = await $fetch(`/api/routines/${routineId}/exercises`, {
    method: 'POST',
    body: { exerciseId, sortOrder: nextSortOrder },
  })
  const newItem: RoutineExerciseItem = { ...created, exercise: /* ... */ }
  routine.value.exercises = [...routine.value.exercises, newItem]
  addTargetSet(newItem)
}
```

`addTargetSet()`・`saveTargetSets()`が目安セットの自動保存を担う。

```ts
function addTargetSet(element: RoutineExerciseItem) {
  element.targetSets = [...element.targetSets, { weightKg: null, reps: 10 }]
  saveTargetSets(element)
}

async function saveTargetSets(element: RoutineExerciseItem) {
  const normalized = normalizeTargetSets(element.targetSets)
  if (!isValidTargetSets(normalized)) return
  targetSetsSaving.value = { ...targetSetsSaving.value, [element.id]: true }
  try {
    const updated = await $fetch(`/api/routines/${routineId}/exercises/${element.id}`, {
      method: 'PATCH', body: { targetSets: normalized },
    })
    element.targetSets = updated.targetSets
  } finally {
    targetSetsSaving.value = { ...targetSetsSaving.value, [element.id]: false }
  }
}
```

| ステップ | 何が起きるか |
|---|---|
| ① `addExercise(exerciseId)` | 既に追加済みの種目でないか確認してから、`POST /api/routines/:id/exercises`を送る。Networkタブで最初に見えたのはこの瞬間 |
| ② `routine.value.exercises = [...]` | レスポンス(`targetSets: []`)を元に、ローカルの`routine.value.exercises`に1件追加する |
| ③ `addTargetSet(newItem)` | ②で追加した種目に対し、`{weightKg: null, reps: 10}`(自重・10回)をローカルの`targetSets`にpushしてから`saveTargetSets()`を呼ぶ |
| ④ `saveTargetSets(element)` | `normalizeTargetSets()`・`isValidTargetSets()`を通した後、`PATCH /api/routines/:id/exercises/:routineExerciseId`を送る。Networkタブで2番目に見えたのはこの瞬間 |

具体例1の`ensureWorkout()`(POST 1回)と違い、ここでは「種目行を作るPOST」と「目安セット1件を保存するPATCH」が別々のエンドポイントへの2回のリクエストに分かれている点に注目してほしい。`routine_exercise`という1つのリソースを作る操作(POST)と、その中の`targetSets`列を更新する操作(PATCH)が分離しているのは、[backend-guide.md](./backend-guide.md)具体例4で見た「`targetSets`はPOST時点では省略可能」という設計に対応している。

### 3. 自分で壊して確かめる

- `targetSetsSaving`・`targetSetsErrors`の`ref()`宣言(現在は`pickedExerciseId`の分岐より上にある)を、一時的に`saveTargetSets()`の直前(ファイル後半)まで移動して保存してみる(`tsx watch`ならぬViteのHMRで即反映)。その状態で「＋種目を追加」から種目を選ぶと、ブラウザのコンソールに`ReferenceError: Cannot access 'targetSetsSaving' before initialization`が出て、`PATCH`が一度も飛ばなくなる(`POST`だけは成功するため、画面上は目安セットの行が一瞬表示されるが、ページを再読み込みすると消えている)。これは**このガイドを書く過程で実際に踏んだ不具合**そのもので、`<script setup>`はトップレベルの文を上から順に実行するため、`pickedExerciseId`の分岐(`addExercise`→`addTargetSet`→`saveTargetSets`を呼ぶ)が、`targetSetsSaving`を`const`で宣言する行より前に実行されると、そのconstはまだ初期化されていない(TDZ = Temporal Dead Zone)。関数宣言(`function addExercise() {...}`)自体は巻き上げられて先に呼べるが、その関数が参照する`ref()`の宣言は巻き上げられない、という2つの性質の違いがこの不具合の正体。**試したら必ず元に戻すこと**
- `saveTargetSets()`の`if (!isValidTargetSets(normalized)) return`を一時的にコメントアウトして保存し、目安セットの回数欄を空にしてフォーカスを外す(blur)してみる → 本来は不正な値として保存をスキップするはずが、`normalizeTargetSets()`の`Number(s.reps)`は空文字列を`0`に変換する(`Number('')`は`NaN`ではなく`0`)ため、`{reps: 0, ...}`を含んだ`targetSets`が`PATCH`で送られ、バックエンドの`repsSchema`(`z.number().int().positive()`。`0`は`positive()`を満たさない)に弾かれて`400`になる。バリデーションをフロントとバックエンドの二重で行っている理由(通信を減らす・入力欄の値をそのまま残せる)が体感できる。**試したら必ず元に戻すこと**

## 具体例4から読み取れる設計上の判断

- **「選んだ瞬間にデフォルト値で保存される」設計は複数の画面で繰り返されている** — ワークアウト記録作成(具体例1)の`ensureWorkout()`+セット追加と、ルーティン編集の`addExercise()`+`addTargetSet()`は、「種目を選ぶ操作そのものが暗黙の保存操作になっている」という同じ設計方針をそれぞれの画面で独立に実装している。保存ボタンを持たない画面がこのアプリに複数あることの一貫性を支えている
- **`<script setup>`のトップレベルの実行順序は、宣言の位置に依存する** — `pickedExerciseId`の分岐のように「画面を開いた直後に副作用のある処理を実行する」コードは、その処理が参照する`ref()`・`const`宣言より下に書くと、意図に反してTDZエラーになる。これは今回のガイド作成中に実際に踏んだ不具合で修正した([Issue #278](https://github.com/ConniConni/torebu/issues/278))。関数宣言は巻き上げられるが中身の変数参照はそうではない、という違いを意識する必要がある

## 具体例5：統計画面でグラフを表示するとき

[`backend-guide.md`](./backend-guide.md)具体例5で追ったGET `/stats/volume`・GET `/stats/exercises/:exerciseId/history`を、フロント側からどう呼んでいるかを見る。対象は[`frontend/app/pages/stats.vue`](../../frontend/app/pages/stats.vue)(統計画面)。ここまでの具体例は「ボタンを押した/種目を選んだ」という**ユーザー操作がきっかけ**でAPIが呼ばれていたが、この画面は**画面を開いた瞬間に2種類のAPIが自動的に呼ばれる**点が違う。

### 1. まず動かして観察する

`frontend`と`backend`を両方`npm run dev`で起動する。ログイン後、Networkタブを開いた状態で下部タブの「統計」をタップして`/stats`へ移動する。

- **画面に切り替わった瞬間** → `GET /api/stats/volume?range=3m`と`GET /api/stats/exercises/<種目id>/history?range=3m`の**2本が、何も操作していないのに続けて流れる**。しかも種目別推移のセレクトボックスには、既に何らかの種目(例:「ベンチプレス」)が選択された状態でグラフが表示されている
- **期間ボタン(「1ヶ月」等)を切り替えた瞬間** → `range`パラメータが変わった`GET /api/stats/volume`・`GET /api/stats/exercises/.../history`がもう一度流れ、グラフの横軸・データが範囲に応じて変わる
- **種目別推移のセレクトボックスで種目を変えた瞬間** → `GET /api/stats/exercises/<選んだ種目のid>/history`だけが流れる(`/stats/volume`は流れない)

「画面を開いただけで、種目を何も選んでいないのに1本目の種目別履歴が飛ぶ」のはこれまでの具体例(ワークアウト記録・ルーティン)には無かった挙動。最初にどの種目が選ばれるのか、次でコードから確認する。

### 2. コードを実行順に追う

```ts
const { fetchVolume, fetchExerciseHistory } = useStats()
const { exercises, fetchExercises } = useExercises()
if (!exercises.value) {
  await fetchExercises()
}

const officialExercises = computed(
  () => exercises.value?.filter((e) => e.createdBy === null && !e.deletedAt) ?? [],
)

const range = ref<StatsRange>('3m')
const selectedExerciseId = ref<string>('')
watchEffect(() => {
  if (!selectedExerciseId.value && officialExercises.value.length > 0) {
    selectedExerciseId.value = officialExercises.value[0]!.id
  }
})

watch(range, () => {
  loadVolume()
  loadHistory()
})
watch(selectedExerciseId, loadHistory, { immediate: true })
await loadVolume()
```

| ステップ | 何が起きるか |
|---|---|
| ① `officialExercises` | `useExercises()`が持つ全種目(公式＋自分のカスタム)から、`createdBy === null`(公式種目のみ)・`deletedAt`無しのものだけに絞る。[backend-guide.md具体例5](./backend-guide.md)で見た`OFFICIAL_EXERCISE_FILTER`と同じ「集計対象は公式種目のみ」という方針を、フロント側は選択肢自体を絞ることで表現している |
| ② `watchEffect(...)` | `selectedExerciseId`が空で`officialExercises`が1件以上あれば、先頭の1件を自動選択する。さっき観察した「開いた瞬間から何かの種目が選ばれている」のはここ。`officialExercises`の並び順は`useExercises()`(`GET /exercises`)がそのまま返す順(使用回数の多い順など)なので、**「一番よく使っている公式種目」が自動的に選ばれる**ことになる |
| ③ `watch(selectedExerciseId, loadHistory, { immediate: true })` | `selectedExerciseId`が変わるたびに`loadHistory()`を呼ぶ。`{ immediate: true }`が付いているため、**登録した瞬間に一度実行される**(値の変化を待たない)。②の`watchEffect`が同期的に`selectedExerciseId`を埋めた直後にこのwatchが登録されるため、immediateが無いと「②で入った初期値」をこのwatchが変化として検知できない(次の「3. 自分で壊して確かめる」で実際に確認する) |
| ④ `await loadVolume()` | スクリプトの最後で1回だけ呼ばれる。`/volume`はrangeにしか依存しないため、`watchEffect`のような仕組みは要らず素直に1回呼べばよい |

`fetchVolume`・`fetchExerciseHistory`本体は[`useStats()`](../../frontend/app/composables/useStats.ts)にある。

```ts
export function useStats() {
  const requestFetch = useRequestFetch()

  async function fetchVolume(range: StatsRange) {
    return requestFetch<VolumePoint[]>('/api/stats/volume', { query: { range } })
  }
  async function fetchExerciseHistory(exerciseId: string, range: StatsRange) {
    return requestFetch<ExerciseHistoryPoint[]>(`/api/stats/exercises/${exerciseId}/history`, { query: { range } })
  }

  return { fetchVolume, fetchExerciseHistory }
}
```

具体例1の`useWorkoutSession()`と同じく`useRequestFetch()`(SSR時のCookie転送のため)を使っているが、**`useState`によるセッション中キャッシュを持たない**点が違う。コード中のコメントにある通り、`range`や選択種目が変わるたびに取り直す一覧なので、画面を離れたら破棄してよい(具体例1の「更新漏れに注意すべきキャッシュ」とは逆に、そもそもキャッシュを持たせない設計)。

### 3. 自分で壊して確かめる

- `watch(selectedExerciseId, loadHistory, { immediate: true })`の`{ immediate: true }`を一時的に外して`watch(selectedExerciseId, loadHistory)`にして保存する(Viteのフルリロードが必要。この画面は初回表示の話なのでHMRの差分反映ではなく`http://localhost:3000/stats`を直接開き直して確認する)。すると、種目別推移のセレクトボックスには変わらず「ベンチプレス」(データがある種目)が選ばれているのに、グラフには**「この期間の記録がありません」**と出て、実際に選ばれている種目のデータが表示されない。これが実際に[Issue #126](https://github.com/ConniConni/torebu/issues/126)で起きていた不具合そのもの。原因はコードのコメントの通りで、`watchEffect`が入れた初期値をこの`watch`が「変化」として検知できないため。セレクトボックスを手動で一度触って選び直すと(`selectedExerciseId`が実際に変化するので)正しく表示される、という中途半端な壊れ方になる点も体感できる。**試したら必ず元に戻すこと**
- `officialExercises`の`filter`条件から`e.createdBy === null`を一時的に外して保存する(HMRで反映)。すると、種目選択のプルダウンに自分のカスタム種目(公式種目ではないもの)も並ぶようになる。選んでみると、`GET /api/stats/exercises/<customId>/history`が[backend-guide.md具体例5](./backend-guide.md)で見た通り`404`になり、グラフ部分にエラーメッセージ「データの取得に失敗しました。時間をおいて再度お試しください」が出る。フロントの選択肢を絞る理由(バックエンドが集計しないものを選べないようにする)が、外したときのエラー表示で確認できる。**試したら必ず元に戻すこと**

## 具体例5から読み取れる設計上の判断

- **「画面を開いた瞬間の自動リクエスト」は`watchEffect`/`watch(..., { immediate: true })`で表現する** — 具体例1・4のように「ユーザー操作の中でAPIを呼ぶ」画面が多い中、この画面は「開いたら勝手に集計結果を出す」閲覧専用の画面のため、素直に`await loadVolume()`(1回だけの初期呼び出し)と`watch(..., { immediate: true })`(初期値を含めて反応する監視)を使い分けている
- **バックエンドの絞り込み方針をフロントの選択肢にも反映する** — `officialExercises`が`createdBy === null`でフィルタしているのは、[backend-guide.md](./backend-guide.md)の`OFFICIAL_EXERCISE_FILTER`と同じ方針をフロント側でも守っている形。選べない種目を選択肢から最初から外すことで、後段の404エラー表示に頼らずに済んでいる(具体例3の「操作できないボタンは隠す」と同じ考え方)
- **画面ごとに使い分けるcomposableのキャッシュ方針** — `useWorkouts()`・`useExercises()`のような一覧は`useState`でセッション中キャッシュするが、`useStats()`はキャッシュしない。両者の違いは「同じデータを複数画面で使い回すか」「パラメータ(range・選択種目)によって毎回内容が変わるものか」で、後者にキャッシュを持たせると`range`ごとに古いデータが残るバグの温床になりやすい

## 具体例6：通知の未読バッジと一覧を表示するとき

[`backend-guide.md`](./backend-guide.md)具体例6で追った「5分遅延・表示時再確認」を、フロント側からどう扱っているかを見る。対象は[`frontend/app/composables/useNotifications.ts`](../../frontend/app/composables/useNotifications.ts)と[`frontend/app/pages/notifications.vue`](../../frontend/app/pages/notifications.vue)。この機能は**バックエンドが「表示してよい通知」だけを返す**設計になっているため、フロント側には5分遅延や再確認のロジックは一切無い。その代わり、「一覧を開いたら自動で全件既読にする」という、これまでの具体例には無かった副作用がある。

### 1. まず動かして観察する

`frontend`と`backend`を両方`npm run dev`で起動する。誰かに自分のグループへ参加してもらい([backend-guide.md具体例6](./backend-guide.md)の手順、または直接DBの`createdAt`を6分前に書き換える方法)、通知が表示される状態にしておく。

- **ホーム画面を開く** → 右上のベルアイコンに未読件数のバッジ(例:「1」)が付いている
- **ベルアイコンをタップして`/notifications`へ移動する** → 一覧に「〇〇さんがグループに参加しました」が**未読の見た目(薄いオレンジの背景・右上の丸ドット)のまま**表示される
- **そのまま「← ホームに戻る」でホームに戻る** → 今度はベルアイコンの**バッジが消えている**

「一覧を開いた瞬間の見た目はまだ未読なのに、ホームに戻るとバッジは消えている」というタイミングのずれが、次でコードから確認できる。

### 2. コードを実行順に追う

```ts
// frontend/app/pages/notifications.vue
async function load() {
  pending.value = true
  loadError.value = false
  try {
    // 既読化より先に一覧を取得することで、開いた瞬間の未読/既読の見た目（ハイライト）を
    // 取得時点のisReadで表示できる（既読化後に取得すると全件既読の見た目になってしまう）
    notifications.value = await fetchNotifications()
    await markAllAsRead()
  } catch {
    loadError.value = true
  } finally {
    pending.value = false
  }
}
await load()
```

| ステップ | 何が起きるか | このときの値 |
|---|---|---|
| ① `notifications.value = await fetchNotifications()` | `GET /notifications`を叩き、その時点の`isRead`を含めた一覧を`notifications`に入れる。画面はこの時点の`isRead`で描画される | `isRead: false`のまま(既読化はまだ) |
| ② `await markAllAsRead()` | ①の**後**に`POST /notifications/read`を呼ぶ。画面の再描画は①で確定した`notifications`(ローカルの配列)を参照するため、②が完了してサーバー側で既読化されても、今見えている一覧の見た目(背景色・ドット)は変わらない | サーバー側の`isRead`は`true`になるが、画面上の`notifications`配列は更新しない |

コメントにある通り、①→②の順序が重要。仮に②を先に呼ぶと、①で取得する一覧が最初から「全部既読」の見た目になってしまい、「どれが新着か」が画面から分からなくなる。

`markAllAsRead()`本体は[`useNotifications()`](../../frontend/app/composables/useNotifications.ts)にある。

```ts
export function useNotifications() {
  const unreadCount = useState<number>('notificationsUnreadCount', () => 0)
  const requestFetch = useRequestFetch()

  async function fetchUnreadCount() {
    try {
      const res = await requestFetch<{ count: number }>('/api/notifications/unread-count')
      unreadCount.value = res.count
    } catch {
      // バッジ表示のための取得なので、失敗しても画面を止めない（表示は0のまま）
    }
  }

  async function markAllAsRead() {
    await $fetch('/api/notifications/read', { method: 'POST' })
    unreadCount.value = 0
  }

  return { unreadCount, fetchUnreadCount, fetchNotifications, markAllAsRead }
}
```

| ステップ | 何が起きるか |
|---|---|
| ① `unreadCount = useState(...)` | `useState`でセッション中キャッシュする(具体例1の`useWorkouts()`と同じ仕組み)。ホーム画面(`HomeScreen.vue`)と通知一覧ページの両方が同じキャッシュを参照するため、**どちらか一方が値を更新すれば、もう一方の表示にも反映される** |
| ② `markAllAsRead()`内の`unreadCount.value = 0` | `POST /notifications/read`が成功した直後、フロント側で**即座に**`unreadCount`を`0`に書き換える。バックエンドから新しい件数を取り直す(`fetchUnreadCount()`を呼び直す)わけではなく、「全件既読にしたのだから0のはず」という前提でローカルの値を直接書き換えている |

観察した「ホームに戻るとバッジが消えている」のはこの②が原因。`HomeScreen.vue`側は`fetchUnreadCount()`を再度呼んでいるわけではなく、`/notifications`ページで書き換えられた同じ`useState`の値をそのまま表示している。

```ts
// frontend/app/components/HomeScreen.vue
const { unreadCount, fetchUnreadCount } = useNotifications()
await fetchUnreadCount()
```

`HomeScreen.vue`自身も起動時に`fetchUnreadCount()`を呼んではいるが、これは「通知一覧を経由せずホームだけを開いたとき」に正しい件数を出すためのもの(具体例5の`useStats()`とは逆に、こちらは`useState`によるキャッシュを積極的に使う設計)。

### 3. 自分で壊して確かめる

- `notifications.vue`の`load()`から`await markAllAsRead()`を一時的にコメントアウトして保存する(HMRで反映)。その状態で①未読の通知がある状態でベルアイコンから一覧を開く→②「← ホームに戻る」でホームに戻る、という手順を踏むと、**ホームに戻ってもバッジの数字が消えずに残ったまま**になる(実際に試すとそうなる)。一覧は開いたのに未読件数だけがずっと古いままという、ユーザーからは分かりにくい壊れ方になる点も体感できる。**試したら必ず元に戻すこと**

## 具体例6から読み取れる設計上の判断

- **バックエンドの「表示してよい通知か」の判定をフロントは信用する** — [backend-guide.md具体例6](./backend-guide.md)で見た5分遅延・再確認のロジックは`GET /notifications`のレスポンスに全て織り込まれているため、フロント側は「返ってきたものをそのまま表示する」だけでよい。具体例5の「バックエンドの絞り込み方針をフロントの選択肢にも反映する」(集計対象外の種目を選ばせない)とは逆に、こちらはフロント側で何も判定し直さない設計
- **「取得してから既読化する」の順序をコードのコメントで明示する** — 順序を間違えると画面の見た目(どれが新着か)が壊れるが、型チェックやテストでは検知しにくい類のバグのため、コメントで明示的に残している
- **`useState`を「サーバーの値の写し」ではなく「画面間で共有する状態」として使う** — `markAllAsRead()`が`unreadCount`を`0`に直接書き換えているのは、サーバーから取り直すのではなく、複数の画面(ホーム・通知一覧)にまたがる1つの状態を直接更新する使い方。`docs/spec.md` §3-3(画面をまたぐ状態の持ち方)に載っているキャッシュ更新漏れの注意点と合わせて読むと理解が深まる

## 具体例7：いいね・コメントをフロントでどう扱うか

[backend-guide.md具体例7](./backend-guide.md)で追ったPOST/DELETE `/workouts/:id/reactions`・GET/POST/DELETE `/workouts/:id/comments`を、フロント側がどう呼んでいるかを見る。対象は[`frontend/app/pages/groups/[id]/workouts.vue`](../../frontend/app/pages/groups/[id]/workouts.vue)(グループの記録フィード)。「自分の記録のいいねボタンは押せない代わりに、いいねした人の一覧を開く専用ボタンになる」というUI固有の分岐と、コメントを開いたときの遅延取得、件数バッジを手動で同期する実装を扱う。

### 1. まず動かして観察する

具体例3までで作ったA(オーナー、記録の持ち主)・B(同じグループのメンバー)で、Aの記録がある状態のグループ記録フィード(`/groups/<groupId>/workouts`)をブラウザで開く。

- **Aでログインして自分のカードのハート(いいね)ボタンを押す** → 何も起きない(トグルしない)。押すと下に「いいねしてくれた人」の一覧が開閉する
- **ログアウトしてBでログインし直し、同じカードのハートボタンを押す** → 即座にハートが塗りつぶされ、件数が1増える。もう一度押すと取り消され、件数が1減る(画面を再読み込みしなくても反映される)
- **「コメント」ボタンを押す** → 初回だけ「読み込み中」の表示が一瞬出てから一覧が表示される。コメントを入力して送信すると、一覧に即座に追加され、ボタンの件数バッジも増える
- **投稿した自分のコメントの隣のゴミ箱アイコンを押す** → 「このコメントを削除しますか?(元に戻せません)」という確認が表示され、「削除する」を押すと消える。他人のコメントにはゴミ箱アイコン自体が表示されない

「自分の記録かどうか」でハートボタンの役割が変わる点、コメントの一覧取得が初回だけ走る点が次のポイント。

### 2. コードを実行順に追う

```ts
// pages/groups/[id]/workouts.vue
function isOwnWorkout(workout: { userId: string }) {
  return workout.userId === user.value?.id
}
```
```html
<!-- 自分の記録: トグルではなく「いいねした人一覧」の開閉ボタンになる -->
<button v-if="isOwnWorkout(workout)" @click="toggleReactorsPanel(workout.id)">
  <HeartIcon :filled="workout.reactionCount > 0" />{{ workout.reactionCount }}
</button>
<!-- 他人の記録: いいねのトグルボタン -->
<button v-else :disabled="likePending.has(workout.id)" @click="toggleLike(workout)">
  <HeartIcon :filled="workout.reactedByMe" />...
</button>
```

```ts
async function toggleLike(workout: NonNullable<typeof workouts.value>[number]) {
  if (likePending.value.has(workout.id)) return
  likePending.value = new Set(likePending.value).add(workout.id)
  try {
    const result = workout.reactedByMe
      ? await unlikeWorkout(workout.id)
      : await likeWorkout(workout.id)
    workout.reactionCount = result.reactionCount
    workout.reactedByMe = result.reactedByMe
  } catch {
    // 通信失敗時は表示をそのまま
  } finally {
    const next = new Set(likePending.value)
    next.delete(workout.id)
    likePending.value = next
  }
}
```

| ステップ | 何が起きるか |
|---|---|
| ① `isOwnWorkout(workout)` | バックエンドの`shareActiveGroup()`の「自分の記録は常に見える」という前提と対になる形で、フロントも「自分の記録かどうか」を`v-if`の起点にしている。バックエンドの`cannot_react_to_own_workout`(具体例7参照)をエラーとして受けて表示するのではなく、そもそも押しても何も起きないボタンにすり替えている |
| ② `toggleLike(workout)`(他人の記録のみ到達) | `likePending`(通信中セット)に自分のworkoutIdが無ければ処理を進める。連打防止用の`disabled`と二重になっている(バックエンドはどのみち冪等だが、フロントは無駄なリクエストそのものを減らす) |
| ③ `workout.reactedByMe ? unlikeWorkout : likeWorkout` | **今の`reactedByMe`を見てPOSTかDELETEかを選ぶ**。トグルの状態はフロントが持たず、常に直前のAPIレスポンスの値を見る |
| ④ `workout.reactionCount = result.reactionCount` | サーバーのレスポンスで`workouts`配列内のオブジェクトを直接書き換える。楽観的更新(先に見た目を変えてから送信)ではなく、**レスポンスが返ってから**反映する。連打しても②の`likePending`で弾かれるため、表示と実際の状態がずれる隙間は無い |

コメントは遅延取得(展開した瞬間に初めて`GET /comments`を呼ぶ)と、件数の手動同期という2点が特徴。

```ts
async function toggleComments(workoutId: string) {
  // ...(開閉の状態管理)
  if (commentsByWorkoutId.value.has(workoutId)) return // 2回目以降は再取得しない
  const comments = await fetchComments(workoutId)
  const map = new Map(commentsByWorkoutId.value)
  map.set(workoutId, comments)
  commentsByWorkoutId.value = map
}

async function onPostComment(workout: NonNullable<typeof workouts.value>[number]) {
  // ...
  const comment = await postComment(workout.id, body)
  const map = new Map(commentsByWorkoutId.value)
  map.set(workout.id, [...(map.get(workout.id) ?? []), comment])
  commentsByWorkoutId.value = map
  workout.commentCount += 1 // 一覧APIには件数(commentCount)しか無いため、投稿のたびに手動で+1する
  // ...
}
```

`commentsByWorkoutId`は「一度開いたら閉じても内容を覚えている」キャッシュになっている(`toggleComments`の`if (commentsByWorkoutId.value.has(workoutId)) return`)。そのため、`workout.commentCount`(カードに出ている件数バッジ)は`GET /workouts/:id/comments`を呼び直さずに**手動で+1/-1**している。一覧APIのレスポンス自体には`commentCount`しか含まれておらず、コメント本文の配列を都度数え直すことはできないための設計。`CLAUDE.md`のセルフチェック項目にある「保存操作のたびに変わりうる値のキャッシュ更新漏れ」(Issue #116)と同じ形の注意点がここにもある。

### 3. 自分で壊して確かめる

- `onPostComment`の`workout.commentCount += 1`を一時的にコメントアウトして保存する(HMRで反映)。他人の記録のコメント欄を開いてコメントを投稿すると、**一覧には投稿した内容がすぐ反映されるのに、「コメント」ボタンの件数バッジだけ0のまま変わらない**(実際に試すとそうなる)。ページを再読み込みすれば正しい件数に直るため、「一覧取得のたびに直る一時的な不整合」に見えてしまい気づきにくい。**試したら必ず元に戻すこと**
- `v-if="isOwnWorkout(workout)"`側の分岐を一時的に消して`v-else`のボタンだけにしてみる(自分の記録にも他人向けのトグルボタンが出るようになる)。その状態で自分の記録のハートを押すと、`likeWorkout`が呼ばれ`POST /workouts/:id/reactions`がバックエンドの`400 cannot_react_to_own_workout`で弾かれる(具体例7参照)。`catch`は空実装のため、画面上は何も起きたように見えず、Networkタブを見て初めて400が返っていることに気づける。**フロントの分岐を外しても、最終的にはバックエンドが弾く**ことが確認できる。試したら元に戻すこと

## 具体例7から読み取れる設計上の判断

- **「操作できない」をエラー表示ではなくUIの出し分けで防ぐ** — バックエンドの`cannot_react_to_own_workout`(400)を`catch`して専用メッセージを出す作りにはせず、そもそも自分の記録には別のボタン(いいね一覧を開く)を出すことで、エラーになる操作自体をUIから無くしている。具体例3の「オーナー限定操作のボタンを隠す」と同じ考え方
- **トグルの状態はローカルに持たず、直前のAPIレスポンスを都度反映する** — `reactedByMe`を送信前に予測して切り替える(楽観的更新)のではなく、レスポンスが返ってから書き換える。連打は`likePending`というフロント側の簡易ロックで防ぎ、バックエンドの冪等性([backend-guide.md具体例7](./backend-guide.md))は「万一フロントの防止をすり抜けても壊れない」ための保険という位置づけになる
- **一覧APIに無い値は手動で同期し、ズレの余地を残す** — `commentCount`は一覧APIのレスポンスに含まれる集計値のため、コメント投稿・削除のたびにフロントの手で`+1`/`-1`する必要がある。他のユーザーが同じ記録にコメントしてもこの画面は再取得しないため、リアルタイムに同期されるわけではない(リロードすれば直る一時的なズレ)

## 具体例8：ランキング画面で指標・期間を切り替えるとき

もう1つの例として、[`frontend/app/pages/groups/[id]/ranking.vue`](../../frontend/app/pages/groups/[id]/ranking.vue)を追う。「合計」「種目別」「継続」の3つの指標タブと、「週間」「月間」「通算」の期間タブを組み合わせて[backend-guide.md具体例8](./backend-guide.md)のGET `/groups/:id/ranking`を呼び分ける画面。指標によって「追加のAPIを呼ぶ/呼ばない」「期間タブを出す/出さない」が変わる点が、これまでの具体例には無かった新しいパターン。

### 1. まず動かしてみる

グループにオーナーA・メンバーBの2人がいて、Aが公式種目(ベンチプレス)のセットを、Bが自重種目(プッシュアップ)のセットのみを記録した状態を作る(backend-guide.md具体例8と同じ手順)。ブラウザでグループ詳細→「ランキングを見る」から実際に遷移してAでログインし、Networkタブを開いた状態で操作する。

- **「合計」→「種目別」タブに切り替える** → 初回だけ`GET /api/groups/:id/ranking/exercises`(種目セレクタの候補)と`GET /api/groups/:id/ranking/default-exercise`(初期選択種目)が追加で飛び、続けて`GET /api/groups/:id/ranking?exerciseId=...`が飛ぶ。**もう一度「合計」→「種目別」を往復しても、2回目以降は`exercises`・`default-exercise`は飛ばない**(`ranking?exerciseId=...`だけが飛ぶ)
- **「種目別」のまま週間→通算のように期間タブを切り替える** → `ranking?period=all&exerciseId=...`のように、選択中の種目を保ったまま期間だけ変えたリクエストが飛ぶ
- **「継続」タブに切り替える** → **どのAPIも新たに呼ばれない**。直前に取得済みの`ranking`データ(`daysTrained`・`attendanceStamp`)をそのまま並べ替えて表示している

これらの「呼ぶ/呼ばない」の使い分けが、次のコードのどこで起きているかを追う。

### 2. コードを実行順に追う

```ts
type Metric = 'total' | 'exercise' | 'attendance'
const metric = ref<Metric>('total')
const selectedExerciseId = ref<string | null>(null)
const rankingExercises = ref<GroupRankingExercise[] | null>(null)
const period = ref<RankingPeriod>('week')
const ranking = ref<...>(null)

async function load() {
  if (metric.value === 'exercise' && !selectedExerciseId.value) {
    ranking.value = []
    pending.value = false
    return
  }
  pending.value = true
  loadError.value = false
  try {
    const exerciseId = metric.value === 'exercise' ? selectedExerciseId.value : null
    const result = await fetchGroupRanking(groupId, period.value, exerciseId)
    ranking.value = result.ranking
  } catch {
    loadError.value = true
  } finally {
    pending.value = false
  }
}
await load()
watch(period, load)

let exerciseModeLoaded = false
async function onSelectMetric(next: Metric) {
  if (metric.value === next) return
  metric.value = next
  if (next === 'attendance') return // 既存のranking.valueをそのまま並べ替えて使うため再取得不要
  if (next === 'exercise' && !exerciseModeLoaded) {
    exerciseModeLoaded = true
    pending.value = true
    try {
      const [exercisesResult, defaultExercise] = await Promise.all([
        fetchGroupRankingExercises(groupId),
        fetchGroupRankingDefaultExercise(groupId),
      ])
      rankingExercises.value = exercisesResult
      selectedExerciseId.value = defaultExercise.exerciseId ?? exercisesResult[0]?.id ?? null
    } catch {
      loadError.value = true
      pending.value = false
      return
    }
  }
  await load()
}
```

| ステップ | 何が起きるか | 「合計」→「種目別」1回目 | 2回目以降 | 「継続」に切り替え |
|---|---|---|---|---|
| ① `if (metric.value === next) return` | 同じタブを2回押しても何もしない(無駄な再取得防止) | 通過(`total`→`exercise`) | 通過 | 通過 |
| ② `if (next === 'attendance') return` | 継続タブは`ranking.value`を書き換えず即終了。表示側(`attendanceSorted`)が既存データを名前順に並べ替えるだけなので、新しいAPI呼び出しが要らない | 該当なし | 該当なし | **ここで終了**。Networkタブに何も流れない理由 |
| ③ `if (next === 'exercise' && !exerciseModeLoaded)` | `exerciseModeLoaded`という関数外の変数(モジュールスコープの閉じたフラグ、`ref`ではない)で「種目一覧を取得済みか」を覚えておく。`ref`ではなく素の変数にしているのは、この値自体を画面に表示する必要が無く、再レンダリングのトリガーにもしたくないため | `true`になり中に入る | **`false`になっており中に入らない**。`exercises`・`default-exercise`が飛ばない理由 | 該当なし |
| ④ `Promise.all([fetchGroupRankingExercises, fetchGroupRankingDefaultExercise])` | 種目セレクタの候補と初期選択種目を並行取得。`Promise.all`でまとめているのは、どちらもお互いの結果に依存しない独立したリクエストのため | 実行される | 実行されない | 該当なし |
| ⑤ `selectedExerciseId.value = defaultExercise.exerciseId ?? exercisesResult[0]?.id ?? null` | バックエンドの「直近28日で最も使われている種目」が無ければ、一覧の先頭(使用回数が多い順)にフォールバックする。それも無ければ`null`(次の⑥で空表示になる) | `<benchId>`が入る | (既存の値を維持) | 該当なし |
| ⑥ `await load()` | ここでようやく`ranking`を取りに行く。`exerciseId`は`metric.value === 'exercise' ? selectedExerciseId.value : null`で決まる | `ranking?exerciseId=<benchId>`が飛ぶ | `ranking?exerciseId=<benchId>`が飛ぶ(セレクタ取得はスキップしても集計は毎回取り直す) | 該当なし |

`watch(period, load)`は`metric`を見ていないため、`metric`が何であっても期間を変えれば`load()`が呼ばれる。`load()`内の`exerciseId`の決め方(上表⑥)により、「種目別」中に期間を変えれば選択中の種目を保ったまま、「合計」中に期間を変えれば`exerciseId: null`で、それぞれ正しく呼び分けられる。

### 3. 自分で壊して確かめる

このガイドを書く過程で、実際に**壊さなくても再現できる既存のバグ**を1つ見つけた。グループの誰も公式種目を記録したことが無い(=`rankingExercises`が空になる)状態で「種目別」タブに切り替えると、`selectedExerciseId.value`が`exercisesResult[0]?.id ?? null`により`null`のままになる。続く`await load()`は上のコードの①のガード(`if (metric.value === 'exercise' && !selectedExerciseId.value)`)に引っかかって`ranking.value = []`で早期returnするが、**このガードには`pending.value = false`が無かった**。`onSelectMetric`側で`pending.value = true`にした後の後始末をこのガードが引き継がないまま関数を抜けるため、`pending`が`true`のまま戻らず、画面が「読み込み中...」から永久に変わらなくなる(実際に検証用の空グループで再現した)。この`docs/dev/`拡張作業と同じPRで、ガードに`pending.value = false`を足して修正した([`ranking.vue`](../../frontend/app/pages/groups/[id]/ranking.vue)参照)。

- 直した`pending.value = false`を一時的に外して保存する(HMRで反映)。公式種目の記録が誰も無いグループ(または新規グループ)で「種目別」タブを開くと、上で説明した「読み込み中...」から戻らない状態が再現できる。**試したら必ず元に戻すこと**
- `exerciseModeLoaded = true`の代入を一時的にコメントアウトして保存する。「合計」↔「種目別」を何度も往復すると、往復のたびにNetworkタブに`ranking/exercises`・`ranking/default-exercise`が飛び続ける(無駄なAPI呼び出しが増える。ユーザー体験としては気づきにくいが、種目数が多いグループほどレスポンスが重くなる)。**試したら必ず元に戻すこと**

## 具体例8から読み取れる設計上の判断

- **「呼ばなくてよいAPI」を明示的に分岐で止める** — 継続タブへの切り替え(`if (next === 'attendance') return`)、種目一覧の再取得スキップ(`exerciseModeLoaded`)は、どちらも「前に取ったデータで足りるなら取り直さない」という同じ考え方。バックエンド側(具体例8)が`totalVolumeKg`と`daysTrained`を1回のレスポンスにまとめているからこそ、フロント側は継続タブで再取得が不要になる
- **`ref`にしない状態もある** — `exerciseModeLoaded`はあえて`ref`にせず素の変数にしている。Vueのリアクティブ変数は「画面に反映すべき値」に使うものという前提があり、単なる「取得済みフラグ」まで`ref`にすると、意図しない再描画やwatchの対象になりうる
- **早期returnのガードは、呼び出し元の状態変更とセットで検証する** — `load()`の冒頭ガードは`ranking.value`だけ気にして書かれており、直前に呼び出し元(`onSelectMetric`)が`pending.value = true`にしていることを見落としていた。関数を分けるほど、「呼び出し元がどんな状態にしてから呼ぶか」を書いた側が意識しないと、今回のような後始末漏れが起きる

## 具体例9：パスワード再設定のトークンを検証するとき

[`backend-guide.md`](./backend-guide.md)で追ったPOST `/auth/password-reset-requests`・POST `/auth/password-resets`を、[`frontend/app/pages/password-reset/index.vue`](../../frontend/app/pages/password-reset/index.vue)(メールアドレス入力)・[`frontend/app/pages/password-reset/[token].vue`](../../frontend/app/pages/password-reset/[token].vue)(新しいパスワード入力)からどう呼んでいるかを見る。これまでの具体例は全てアプリ内のリンク・ボタンだけで遷移が完結していたが、この2画面目だけは**メール本文のリンクを踏むことでしか本来たどり着けない**という毛色の違いがある。

### 1. まず動かして観察する

`/login`の「パスワードをお忘れの方」からSPA内リンクで`/password-reset`に遷移し、登録済みのメールアドレスを入力して送信する。

- **送信ボタンを押した瞬間** → `POST /api/auth/password-reset-requests`が流れ、`202`が返る。この直後、フォームが消えて「入力されたメールアドレス宛に...送信しました」という完了メッセージに置き換わる(別画面へは遷移しない)
- バックエンドがローカル開発でメール送信をスキップしている場合(backend-guide.md具体例9参照)、`backend`の`npm run dev`のターミナル出力にリセットURL(`http://localhost:3000/password-reset/<token>`)が出る。このURLをブラウザのアドレスバーに直接入力して開く(アプリ内リンクが無いので、ここだけは直接URLを開く=フルリロードでよい)

トークン画面で、まず**新しいパスワードと確認用に別々の値**を入力して送信する。

- **APIへのリクエストは1件も流れない**。`パスワードが一致しません`というメッセージがその場に表示されるだけ(クライアント側だけで完結するチェック)

次に、同じ値を入力し直して送信する。

- `POST /api/auth/password-resets`が流れ、`200`が返る。この直後、画面は`/login`へ遷移する(完了メッセージなどは挟まない)
- 新しいパスワードでログインできることを確認しておく

最後に、**同じURL(消費済みのトークン)をもう一度開いて**、適当なパスワードを入力して送信してみる。

- フォーム自体は(トークンが有効かどうかの事前チェックが無いため)何の変哲もなく表示される。送信して初めて`POST /api/auth/password-resets`が`400 {"error":"invalid_or_expired_token"}`を返し、「リンクの有効期限が切れているか、無効なリンクです。もう一度お試しください」が表示される

### 2. コードを実行順に追う

```ts
// password-reset/index.vue
async function onSubmit() {
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    await requestPasswordReset(email.value)
    isCompleted.value = true
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
```

```ts
// password-reset/[token].vue
const route = useRoute()
const token = route.params.token as string

async function onSubmit() {
  errorMessage.value = ''
  if (password.value !== passwordConfirmation.value) {
    errorMessage.value = 'パスワードが一致しません'
    return
  }
  isSubmitting.value = true
  try {
    await resetPassword(token, password.value)
    await navigateTo('/login')
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
```

```ts
// useAuth.ts
// 常に同じレスポンスを返すAPI(メールアドレス列挙対策)のため、成否を返さず完了を示すのみ
async function requestPasswordReset(email: string) {
  await $fetch('/api/auth/password-reset-requests', { method: 'POST', body: { email } })
}

async function resetPassword(token: string, password: string) {
  await $fetch('/api/auth/password-resets', { method: 'POST', body: { token, password } })
}
```

| ステップ | 何が起きるか |
|---|---|
| ① `route.params.token` | URLの`/password-reset/<token>`の`<token>`部分を、Nuxtの動的ルート(`[token].vue`というファイル名がこの角括弧記法に対応する)がそのまま文字列として渡してくれる。バリデーションは無く、でたらめな値でもこの時点ではエラーにならない |
| ② `if (password.value !== passwordConfirmation.value)` | この一致確認は**フロントだけの責務**。`resetPassword(token, password.value)`の引数を見ての通り、確認用の値(`passwordConfirmation`)はAPIに送られすらしない。一致チェックがここで通らなければ、そもそもAPIを呼ぶ`try`ブロックに入らない |
| ③ `await requestPasswordReset(email.value)` | 成功・失敗どちらの分岐も持たない(戻り値を見ていない)。バックエンドが常に`202`を返す設計(backend-guide.md参照)に合わせて、フロント側も「送った」という事実だけを`isCompleted`に反映する |
| ④ `await resetPassword(token, password.value)`→`await navigateTo('/login')` | 成功時は完了画面を挟まず、直接ログイン画面に遷移する。具体例2で見たログイン後の`/`遷移と違い、ここでは`user`state(`useAuth`の`user`)を更新するAPIではないため、遷移先の`/login`側は改めてメールアドレス・パスワードの入力を求める |
| ⑤ 失敗時(`catch`) | `authErrorMessage(error)`が`invalid_or_expired_token`を「リンクの有効期限が切れているか、無効なリンクです。もう一度お試しください」に変換する(`useAuth.ts`の`ERROR_MESSAGES`)。バックエンドが期限切れと不正なトークンを区別しない(backend-guide.md参照)ため、フロント側のメッセージも両者を区別しない |

`[token].vue`には、トークンが有効かどうかを画面表示前に確認する処理が無い。**期限切れ・使用済み・でたらめなトークンのどれであっても、フォームは同じように表示され、送信して初めてエラーに気付く**設計になっている(具体例2の`guest`/`auth`ミドルウェアのような「開く前に弾く」ガードは、ここには無い)。

### 3. 自分で壊して確かめる

- `[token].vue`の`if (password.value !== passwordConfirmation.value) { ... return }`を一時的に削除して保存する(HMRで反映)。この状態で新しいパスワードと確認用に別々の値を入力して送信すると、**確認用の値は無視され、最初のパスワード入力欄(`password.value`)の値でリセットが成功してしまう**(実際に試すとそうなる。`resetPassword(token, password.value)`の引数を見ての通り、確認用フィールドはそもそも渡されていないため)。「確認用の入力は、一致しているかどうかをフロントが見ているだけ」であることが体感できる。**試したら必ず元に戻すこと**
- `password-reset/index.vue`の`isCompleted.value = true`を一時的にコメントアウトして保存する。送信は成功する(Networkタブで`202`が確認できる)が、画面はフォームのまま変わらず、送信できたことに気付けなくなる。`isCompleted`という1つの`ref`だけで「送信前のフォーム」と「送信後の完了表示」を出し分けている設計であることが分かる。**試したら必ず元に戻すこと**

## 具体例9から読み取れる設計上の判断

- **確認用パスワードの一致チェックは、UXのためだけにフロントに置く** — バックエンドの`passwordResetSchema`(backend-guide.md参照)はそもそも`password`しか受け取らず、`passwordConfirmation`という概念自体を知らない。入力ミス防止という目的が最初から「フロントだけで完結してよい」性質だと分かっていれば、無駄にAPIの型を増やさずに済む
- **トークンの事前検証を省略し、「送信して失敗で気付く」設計にしている** — `/mypage/password`のような認証済みの画面と違い、トークンの真偽をこの画面が開いた時点で確認する手段(専用のGET APIなど)を用意していない。実装コストとのトレードオフだが、無効なリンクを踏んだユーザーはフォーム入力を1回終えるまでそれに気付けない
- **列挙対策と使い切りの設計が、フロントのメッセージ文言にもそのまま表れる** — 「メールが届かない場合は...可能性があります」(存在有無を断定しない)、「期限切れか無効なリンクです」(理由を1つに絞らない)という2つの文言は、バックエンドが意図的に情報を絞っている(backend-guide.md参照)ことの裏返し。フロント側だけを見ても、バックエンドの設計意図がメッセージの曖昧さから読み取れる

## 具体例10：ログイン中にパスワードを変更するとき

[backend-guide.md具体例10](./backend-guide.md)で追ったPOST `/auth/password-changes`を、[`frontend/app/pages/mypage/password.vue`](../../frontend/app/pages/mypage/password.vue)がどう呼んでいるかを見る。具体例9の2画面(`/password-reset`・`/password-reset/[token]`)はどちらも`guest`ミドルウェア(未ログイン専用)だったが、この画面は`auth`ミドルウェア(ログイン必須)。同じ「パスワード」というテーマでも、画面のガードが正反対になる。

### 1. まず動かして観察する

`frontend`と`backend`を両方`npm run dev`で起動し、ログインした状態でマイページ→「パスワードを変更」から`/mypage/password`へ遷移する(SPA内リンク)。

- 現在のパスワードを間違えて送信すると、画面遷移せずにエラーメッセージだけが表示される(具体例2のログイン画面と同じ、フォームを維持したままのエラー表示)
- 正しく変更すると完了メッセージに切り替わり、そのままページに留まる(具体例9の`[token].vue`が`/login`へ遷移するのとは対照的に、こちらはどこにも移動しない)。ページを離れずに別タブで`/mypage`を開き直す等でログイン状態を再確認しても、**ログイン状態のまま**であることが確認できる

### 2. コードを実行順に追う

```ts
// mypage/password.vue
async function onSubmit() {
  errorMessage.value = ''
  if (newPassword.value !== newPasswordConfirmation.value) {
    errorMessage.value = '新しいパスワードが一致しません'
    return
  }
  isSubmitting.value = true
  try {
    await changePassword(currentPassword.value, newPassword.value)
    isCompleted.value = true
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
```

```ts
// useAuth.ts
async function changePassword(currentPassword: string, newPassword: string) {
  await $fetch('/api/auth/password-changes', {
    method: 'POST',
    body: { currentPassword, newPassword },
  })
}
```

```ts
// useAuth.ts
const ERROR_MESSAGES: Record<string, string> = {
  // ...
  invalid_current_password: '現在のパスワードが正しくありません',
  same_as_current_password: '現在と異なるパスワードを入力してください',
}
```

| ステップ | 何が起きるか |
|---|---|
| ① `newPassword.value !== newPasswordConfirmation.value` | 具体例9の`[token].vue`と同じく、確認入力の一致はフロント側だけでチェックする。`changePassword()`の引数を見ての通り、確認用の値はAPIに送られない |
| ② `changePassword()` | 戻り値を`user`に代入しない。`user`の中身(表示名等)が変わるわけではないため、そもそも代入する対象が無い |
| ③ `isCompleted.value = true` | 成功時は`navigateTo`を呼ばず、そのまま同じページに留まる。具体例9の`[token].vue`が`/login`へ送るのは「ログイン状態にない」ため入力し直してもらう必要があるからで、こちらはログイン状態を維持したまま完了を伝えるだけでよい |
| ④ 失敗時(`invalid_current_password`・`same_as_current_password`) | `authErrorMessage()`がそれぞれ別の日本語メッセージに変換する。バックエンド側([backend-guide.md具体例10](./backend-guide.md))で別のエラーコードとして区別されているものを、フロントも区別したまま伝えている |

`invalid_current_password`と`same_as_current_password`をあえて別メッセージにしている点は、具体例2のログイン失敗(`invalid_credentials`1種類にまとめる)と対照的。ログイン失敗はメールアドレス列挙対策のため原因を隠す必要があるが、こちらはログイン中の本人が相手なので、原因を分けて伝えても列挙対策上の問題が無い。

### 3. 自分で壊して確かめる

- `v-if="isCompleted"`を一時的に`v-if="false && isCompleted"`に変えて保存すると、変更成功後も完了メッセージに切り替わらずフォームが表示され続ける(実際に確認済み)。`currentPassword`・`newPassword`の`ref`はクリアしていないため、値も入力したまま残る。ここで**入力欄に残っているのは新しいパスワードではなく、変更前に入力した古い現在のパスワードの方**である点に注意(`current-password`欄には変更前の値が、`new-password`欄には新しいパスワードがそのまま残る。実際に確認済み)。この状態でもう一度送信すると、`currentPassword`欄の値(既に無効になった古いパスワード)で認証しようとするため、`invalid_current_password`になる(こちらも実際に確認済み)。**試したら必ず元に戻すこと**

## 具体例10から読み取れる設計上の判断

- **画面のガード(`guest`/`auth`)は「ログイン状態を変える操作かどうか」で決まる** — 具体例9の2画面はログイン状態を持たない(`guest`)操作、この画面はログイン状態を前提とする(`auth`)操作。同じ「パスワード」というテーマでも、操作の前提となるログイン状態が違えば使うミドルウェアも変わる
- **成功後にページを離れるかどうかは、ログイン状態が変わるかどうかで決まる** — 具体例9の`resetPassword()`はログイン状態にしないため`/login`へ送る必要があるが、`changePassword()`はログイン状態を変えないため、どこにも移動せず完了を伝えるだけでよい
- **列挙対策が要らない場面ではエラーコードを分けたままにする** — ログイン失敗は`invalid_credentials`1種類にまとめる一方、ログイン中のパスワード変更失敗は`invalid_current_password`/`same_as_current_password`の2種類のまま日本語メッセージに変換している。「本人しか呼べない操作かどうか」で、エラーコードを統合するかどうかの方針が変わる

## 具体例11：カスタム種目を追加・削除するとき

[backend-guide.md具体例11](./backend-guide.md)で追ったPOST/DELETE `/exercises`を、フロント側の[`frontend/app/composables/useExercises.ts`](../../frontend/app/composables/useExercises.ts)がどう扱っているかを見る。この一覧(`exercises`)は`useState`で③記録作成・④種目選択・⑦種目追加のあいだセッション中ずっとキャッシュされ続ける(Issue #116の再発防止パターンについてはCLAUDE.mdのセルフチェック項目も参照)。追加・削除のたびに一覧を取り直すのではなく、その場で配列を書き換えて反映する実装になっている。

### 1. まず動かして観察する

`/workouts/new`(③記録作成)から「＋種目を追加」→「④種目選択」→「＋種目を追加」(⑦種目追加)と進み、名前・部位を入力して追加する。

- 追加すると、④の画面には戻らず、追加した種目が選択済みの状態で直接③に戻る(**Networkタブでは`POST /api/exercises`の後に`GET /api/exercises`は流れない**)
- ③の種目カードに追加した種目名がすぐ表示される

続けて④種目選択画面に戻り、追加した種目の削除アイコン(ゴミ箱)を押す。「削除しますか?(元に戻せません)今後この種目は選べなくなりますが、これまでの記録・ルーティンはそのまま残ります」という確認が出る。「削除する」を押すと、

- **一覧からその種目が即座に消える**(こちらも`DELETE`の後に`GET /api/exercises`は流れない)
- そのまま③に戻ると、**削除したはずの種目名が(不明な種目にならず)そのままカードに表示され続けている**
- ③のカードの「+セット追加」を押すと、削除済みの種目にもかかわらず**セットが追加できてしまう**(backend-guide.md具体例11で見た「既存のworkoutExerciseへの追記は許す」例外がここで効いている)

一覧の再取得なしに画面が正しく更新される点と、削除済みでも既存カードには追記できてしまう点、両方をNetworkタブとカードの表示で確認しておく。

### 2. コードを実行順に追う

```ts
// composables/useExercises.ts
async function createExercise(payload: CreateExercisePayload) {
  const exercise = await $fetch<Exercise>('/api/exercises', { method: 'POST', body: payload })
  // 一覧に追加した種目をその場で反映する(再取得すると使用回数の集計まで走り直すため、追記で済ませる)
  exercises.value = [...(exercises.value ?? []), exercise]
  return exercise
}

async function deleteExercise(id: string) {
  await $fetch(`/api/exercises/${id}`, { method: 'DELETE' })
  exercises.value = (exercises.value ?? []).map((e) =>
    e.id === id ? { ...e, deletedAt: new Date().toISOString() } : e,
  )
}
```

| ステップ | 何が起きるか |
|---|---|
| ① `createExercise`が`exercises.value`に`POST`のレスポンスをそのまま追記する | `fetchExercises()`(`GET /api/exercises`丸ごと再取得)を呼び直さない。使用回数(`useCount`)の集計・表示順の並べ替えまでバックエンドが毎回やり直す処理を、種目を1件追加するだけのために走らせないための省略 |
| ② `deleteExercise`が該当要素だけ`deletedAt`を差し替えた**新しい配列**を作って`exercises.value`に代入する | 該当要素を配列から取り除く(`filter`)のではなく、`deletedAt`だけを立てた新しいオブジェクトに置き換えている。バックエンドの`GET /exercises`が削除済みの種目も返し続けるのと同じ理由で、フロントのキャッシュからも消してしまうと、③の既存カードが種目名を解決できなくなる(`exercises`配列から該当種目自体が無くなるため) |

この`deletedAt`を実際に「選べなくする」側で見ているのが、④種目選択画面([`pages/workouts/exercises.vue`](../../frontend/app/pages/workouts/exercises.vue))の絞り込み。

```ts
const sections = computed(() =>
  MUSCLE_GROUPS.map((group) => ({
    group,
    label: muscleGroupLabel(group),
    exercises: (exercises.value ?? []).filter(
      (e) => e.muscleGroup === group && !e.deletedAt && matchesEquipmentFilter(e),
    ),
  })),
)
```

`sections`は`computed`なので、`exercises.value`(useExercisesが持つ配列そのもの)が変わるたびに自動で再評価される。①・②で見た「配列を書き換える」実装だけで、④の一覧・⑦の重複候補(`exercises-new.vue`の`similarExercises`も同じく`!exercise.deletedAt`で絞り込む)の両方が、画面遷移や再取得なしに正しく更新される理由がここにある。

「削除済みでも既存カードには追記できる」の方は、フロント側には特別な分岐が無い。③のセット追加ボタンは`workout.exercises`(その日のworkoutに紐づく種目カード一覧。`useExercises`とは別の状態)を見て並んでいるだけで、その種目が削除済みかどうかを一切気にしていない。「削除済みの種目は新規の記録には**選べない**」という制約は④・⑦の`!deletedAt`フィルタだけで作られており、③のカードは一覧に出た時点で(削除状態に関わらず)普通にセット追加できる。backend-guide.md具体例11で見た`isExerciseVisible`の`existingSet`チェックが最終防衛になっている。

### 3. 自分で壊して確かめる

- `deleteExercise`の`exercises.value = (exercises.value ?? []).map(...)`を一時的にコメントアウトして保存する(HMRで反映)。その状態で種目を削除すると、`DELETE`自体は`204`で成功する(Networkタブで確認できる)のに、**④の一覧からその種目が消えない**(削除ボタンを押しても見た目が変わらない)。画面を再読み込みすれば`GET /exercises`で最新の`deletedAt`ごと取り直されるため一覧から消えるが、リロードするまでは「削除できていないように見える」ままになる。CLAUDE.mdのセルフチェック項目にある「保存操作のたびに変わりうる値のキャッシュ更新漏れ」(Issue #116)と同じ形の不具合を、削除でも起こせることが確認できる。**試したら必ず元に戻すこと**
- `pages/workouts/exercises.vue`の`sections`の`filter`から`!e.deletedAt`を一時的に外して保存する。削除した種目が④の一覧に(取り消し線も無くただの種目として)復活し、選択すると③のカードに追加できてしまう。「新規には選べない」という制約が、バックエンドの`isExerciseVisible`ではなくこの1行だけで支えられている(バックエンドは`workoutId`の有無で判定するため、新規カードに対する`invalid_exercise`はバックエンド側でも最終的に弾かれるが、フロント側はエラー表示のための特別な分岐を持たないため、押した瞬間は何も起きたように見えない)。**試したら必ず元に戻すこと**

## 具体例11から読み取れる設計上の判断

- **一覧の再取得ではなく、変化した分だけ配列を書き換える** — `createExercise`は追記、`deleteExercise`は該当要素の置き換え。どちらも`fetchExercises()`を呼び直さない。具体例7の`commentCount`手動同期(値の一部を書き換える)や、同じ`useExercises.ts`内の`patchLastSet`(1種目分の`lastSet`だけを書き換える)と同じ「一覧APIを叩き直さずキャッシュを手で最新化する」パターンだが、こちらは値の一部ではなく配列の要素の追加・置き換えという構成レベルの書き換えである点が違う
- **「消す」ではなく「印を付ける」形でキャッシュを書き換える** — `deleteExercise`は配列から要素を取り除かず、`deletedAt`を立てた新しいオブジェクトに置き換える。バックエンドの`GET /exercises`が削除済みの種目を返し続けるのと対になる実装で、これにより③の既存カードは削除後も種目名を解決し続けられる
- **「選べなくする」制約は一覧側の表示フィルタだけが担い、既存カードには及ばない** — `!deletedAt`によるフィルタは④の選択候補・⑦の重複候補にしか掛かっておらず、③の既存カードのセット追加ボタンには掛かっていない。「新規に選べない」と「継続して使える」という2つの異なる制約を、画面側で分けて実装するのではなく、片方(新規に選べない)だけをフロントが担当し、もう片方の最終防衛はバックエンドの`isExerciseVisible`に委ねている

## 具体例12：新規登録するとき

もう1つの例として、[`pages/register.vue`](../../frontend/app/pages/register.vue)と[`composables/useAuth.ts`](../../frontend/app/composables/useAuth.ts)の`register()`を追う。backend-guide.md具体例12で見たとおり、バックエンドの`POST /auth/register`は「アカウントを作るだけでログイン状態にはしない」設計になっている。この差をフロント側がどう埋めているかがここでの主題。

### 1. まず動かしてみる

`frontend`を`npm run dev`で起動した状態で、実際にブラウザ(`http://localhost:3000/`)を操作する。直接`/register`のURLを開くのではなく、トップページの「新規登録」リンクをクリックしてSPA内遷移で移動する。

表示名・メールアドレス・パスワード(確認含む)・生年月(または「回答しない」)・性別・職業を入力し、**利用規約・プライバシーポリシーの両方を一度開いてから**同意チェックを入れて「登録する」を押す。ここで2つ試してほしい。

- **利用規約・プライバシーポリシーを開かずに同意チェックを入れようとする** → チェックボックスが`disabled`になっていて反応しない。片方だけ開いた状態でもまだ反応しない。両方開いて初めてチェックできるようになる
- **登録が成功した直後の画面** → `/`へ遷移し、**ログイン済みの状態でホーム画面が表示される**(登録専用の完了画面や、ログインを促す画面は挟まない)。バックエンドのレスポンス単体では起きないはずのこの遷移が、フロント側の何によって実現されているかを次で追う

続けてもう1つ、既にログイン済みの状態で`/register`をブラウザのURLバーから直接開くとどうなるか試してみる。フォームは表示されず、即座に`/`へ戻される。

### 2. コードを実行順に追う

まず、ログイン済みなら`/register`に入れない仕組み。

```ts
// middleware/guest.ts
export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchMe } = useAuth()
  if (!user.value) {
    await fetchMe()
  }
  if (user.value) {
    return navigateTo('/')
  }
})
```

```ts
// register.vue
definePageMeta({ middleware: 'guest' })
```

| ステップ | 何が起きるか |
|---|---|
| ① `definePageMeta({ middleware: 'guest' })` | このページに入る前に`guest`ミドルウェアが必ず実行される |
| ② `if (!user.value) { await fetchMe() }` | `useState`で共有される`user`がまだ無ければ、`GET /auth/me`でログイン状態を問い合わせて確定させる(具体例2参照) |
| ③ `if (user.value) { return navigateTo('/') }` | 確定した結果、ログイン済みなら`/`へリダイレクト。直接URLを開いたときに弾かれたのはここ |

次に、利用規約・プライバシーポリシーを開くまで同意チェックが押せない仕組み。

```ts
const hasViewedTerms = ref(false)
const hasViewedPrivacy = ref(false)
const canAgreeToTerms = computed(() => hasViewedTerms.value && hasViewedPrivacy.value)

const openTermsModal = ref<'terms' | 'privacy' | null>(null)
function showTermsModal(type: 'terms' | 'privacy') {
  openTermsModal.value = type
  if (type === 'terms') hasViewedTerms.value = true
  else hasViewedPrivacy.value = true
}
```

```html
<input v-model="agreedToTerms" type="checkbox" required :disabled="!canAgreeToTerms" />
```

| ステップ | 何が起きるか |
|---|---|
| ① `showTermsModal('terms')` | 「利用規約」ボタンを押すとモーダルを開くと同時に`hasViewedTerms`を`true`にする。**モーダルを閉じたタイミングではなく、開いた瞬間**にフラグが立つ点に注意(実際に最後まで読んだかまでは確認できない、というゆるい担保) |
| ② `canAgreeToTerms`(computed) | `hasViewedTerms`・`hasViewedPrivacy`の両方が`true`になって初めて`true`になる。片方だけ開いた段階でチェックボックスがまだ反応しなかったのはこの条件のため |
| ③ `:disabled="!canAgreeToTerms"` | `canAgreeToTerms`が`false`の間はチェックボックス自体が`disabled`属性を持ち、クリックしても状態が変わらない |

最後に、登録成功後にログイン済み状態で`/`へ遷移する仕組み(今回の主題)。

```ts
// useAuth.ts
// 登録APIはユーザー作成のみでログイン状態にはならないため、登録後に続けてログインする
async function register(payload: RegisterPayload) {
  await $fetch('/api/auth/register', { method: 'POST', body: payload })
  return login({ email: payload.email, password: payload.password })
}
```

```ts
// register.vue
await register({ email: email.value, password: password.value, /* ... */ })
await navigateTo('/')
```

| ステップ | 何が起きるか |
|---|---|
| ① `$fetch('/api/auth/register', ...)` | backend-guide.md具体例12の`POST /auth/register`を呼ぶ。成功しても`user`(`useState`で共有されるログイン中ユーザー)はまだ`null`のまま |
| ② `return login({ email, password })` | `register()`の中で、今しがた登録した`email`・`password`を使い、具体例2で読んだ`login()`(`POST /auth/login`)を**続けて呼ぶ**。ここで初めて`user.value`にログイン中ユーザーの情報が入る | 
| ③ `register.vue`側の`await register(...)` | `register()`の完了を待つ時点で、内部の`login()`まで完了している。呼び出し側(`register.vue`)は「ログインも一緒にやっている」ことを意識しなくてよい |
| ④ `await navigateTo('/')` | `user.value`が既にセット済みの状態で`/`へ遷移するため、ホーム画面はログイン済み表示になる。**別のAPI呼び出しをもう1段挟んでいるわけではなく、`register()`という1つの関数呼び出しの中に2回のAPIコールが隠れている** |

重複メールアドレスで登録しようとしたときのエラー表示(「このメールアドレスは既に登録されています」)は、具体例2の`authErrorMessage()`・`ERROR_MESSAGES`がそのまま使われている。`ERROR_MESSAGES`に`email_already_registered: 'このメールアドレスは既に登録されています'`が登録済みで、`register.vue`の`catch`節が`authErrorMessage(error)`を呼ぶだけで済んでいる。

### 3. 自分で壊して確かめる

- `useAuth.ts`の`register()`から`return login(...)`を一時的にコメントアウトして保存する(HMRで反映)。その状態で新規登録フォームを送信すると、`POST /auth/register`自体は`201`で成功する(Networkタブで確認できる)のに、`/`へ遷移した後の画面が**ログイン前のWelcomeScreen(「ログイン」「新規登録」ボタンが並ぶ画面)のまま**になる。登録は成功しているのにログインした感触が得られない、という体験の悪さが「続けて`login()`を呼ぶ」1行だけで支えられていることが分かる。**試したら必ず元に戻すこと**
- `canAgreeToTerms`の`computed`を一時的に`computed(() => true)`に変えて保存する。利用規約・プライバシーポリシーを一度も開かなくても同意チェックが押せるようになり、Issue #163が防ごうとした「リンクを開かずに同意できてしまう」状態を再現できる。**試したら必ず元に戻すこと**

## 具体例12から読み取れる設計上の判断

- **「バックエンドの2段階」をフロントの1回の関数呼び出しに畳み込む** — `POST /auth/register`(作成)と`POST /auth/login`(ログイン)という2つのAPI呼び出しを、`useAuth.ts`の`register()`という1つの関数の中に隠している。呼び出し側の`register.vue`は「登録すればログイン状態になる」という体験だけを意識すればよく、バックエンドがそれを2つのAPIに分けている理由(具体例2・backend-guide.md具体例12参照)を知らなくても書ける
- **同意チェックの「有効化条件」を専用のcomputedに切り出す** — `canAgreeToTerms`という1つの`computed`に条件を集約することで、テンプレート側は`:disabled="!canAgreeToTerms"`と`v-if="!canAgreeToTerms"`(ヒント文表示)の2箇所から同じ条件を参照するだけで済む。条件をテンプレート内に直接書いていたら、2箇所で書き方がずれる可能性があった
- **ページ単位のガードはmiddlewareに集約する** — 「ログイン済みなら`/register`に入れない」という制約は、`register.vue`自身にif文を書くのではなく`middleware: 'guest'`という宣言だけで済ませている。同じ`guest`ミドルウェアは`/login`にも使われており(次に読むファイル参照)、「未ログイン専用ページ」という分類をミドルウェア1つで横断的に表現している

## 具体例13：自己ベスト・通算の節目・久しぶりの復帰をその場に表示するとき

[backend-guide.md具体例13](./backend-guide.md)で追った、セット保存API(`POST`/`PATCH /workouts/:id/sets`)が返す`personalBest`・`achievements`を、③記録画面がどう表示するかを見る。対象は[`useWorkoutSession.ts`](../../frontend/app/composables/useWorkoutSession.ts)の`addSet()`・`updateSet()`と、[`workouts/new.vue`](../../frontend/app/pages/workouts/new.vue)の`applyPersonalBest()`・`applyAchievements()`。具体例6(通知)は「バックエンドが返したものをそのまま表示するだけ」だったが、こちらは**保存APIの応答から達成内容を拾い、このページだけのローカル状態に積む**という別の持ち方をしている。

### 1. まず動かして観察する

`frontend`・`backend`を両方`npm run dev`で起動し、ログインしておく(具体例1の手順)。

- ③記録画面(`/workouts/new`)である種目に重量を保存する(初めての記録) → 達成の表示は何も出ない
- 同じ種目で、**前回より重い重量**のセットをもう1つ追加する → セットの一覧の下に、黄色い「🏆 自己ベスト更新！◯◯kg（これまで◯◯kg）」というバッジが出る(実際に試すとそうなる)
- **バッジが出た方のセットを削除する** → バッジは消える(達成したセット自体が無くなったため)
- 「← ホームに戻る」でホームに戻り、**同じ日の記録をもう一度開く(SPA内遷移)** → さっき出ていたバッジは(サーバー側では今も自己ベストのままなのに)**出ていない**(実際に試すとそうなる)

3つ目・4つ目の「消え方」が、それぞれコードのどこで起きているかを次で確認する。

### 2. コードを実行順に追う

まず保存側`useWorkoutSession.ts`の`addSet()`(抜粋、具体例4で見たものと同じ関数)。

```ts
async function addSet(exerciseId: string, reps: number, weightKg?: number) {
  const workoutId = await ensureWorkout()
  const { workoutExercise, personalBest, achievements, ...set } = await $fetch<
    WorkoutSetItem & {
      workoutExercise: WorkoutExerciseItem
      personalBest: PersonalBest | null
      achievements: Achievements
    }
  >(`/api/workouts/${workoutId}/sets`, { method: 'POST', body: { exerciseId, reps, weightKg } })
  session.value.sets = [...session.value.sets, set]
  // ...(種目カードの反映・前回記録キャッシュの更新は省略)
  return { set, personalBest, achievements }
}
```

| ステップ | 何が起きるか |
|---|---|
| ① `{ ..., personalBest, achievements, ...set } = await $fetch(...)` | レスポンスを分割代入で受け取る時点で、`personalBest`・`achievements`は`set`(セット本体)と切り離される |
| ② `session.value.sets = [...session.value.sets, set]` | `session`(`useState`で永続化される③のセッション状態、具体例1・4で既出)に積まれるのは**`set`だけ** |
| ③ `return { set, personalBest, achievements }` | `personalBest`・`achievements`は`session`には一切入らず、呼び出し元への**戻り値**としてだけ渡される |

`session`(サーバーと同じ実体を持つセット一覧)には達成内容が乗らない、という設計がここで決まる。「バッジが消える/消えない」を次に決めるのは、この戻り値を受け取る`new.vue`側。

```ts
// frontend/app/pages/workouts/new.vue
const personalBests = reactive(new Map<string, PersonalBest & { setId: string }>())

function applyPersonalBest(set: WorkoutSetItem, personalBest: PersonalBest | null) {
  if (personalBest) {
    personalBests.set(set.exerciseId, { ...personalBest, setId: set.id })
    return
  }
  const current = personalBests.get(set.exerciseId)
  if (current?.setId === set.id && current.weightKg !== set.weightKg) {
    personalBests.delete(set.exerciseId)
  }
}

function personalBestFor(exerciseId: string) {
  const personalBest = personalBests.get(exerciseId)
  if (!personalBest || !session.value.sets.some((s) => s.id === personalBest.setId)) return null
  return personalBest
}
```

| ステップ | 何が起きるか | 観察した動きとの対応 |
|---|---|---|
| ① `const personalBests = reactive(new Map(...))` | `session`と違い**`useState`を使っていない**、このコンポーネントだけのローカル変数。ページを離れてコンポーネントが破棄されると内容ごと消える | 4つ目(SPA内遷移で戻るとバッジが消える)の正体はここ。`session`はサーバーに保存された実体の写しだが、`personalBests`はどこにも保存されていない「今の画面だけの記憶」 |
| ② `personalBests.set(exerciseId, { ...personalBest, setId: set.id })` | 保存APIが`personalBest`を返した(=自己ベスト更新があった)ときは、`setId`(どのセットの達成か)も一緒に記録して種目ごとに1件だけ持つ | 2つ目(重い重量を保存するとバッジが出る)はここ |
| ③ `personalBestFor(exerciseId)`内の`session.value.sets.some((s) => s.id === personalBest.setId)` | 表示する直前に、**達成したセット自体が今も`session.value.sets`に残っているか**を毎回確認し直す | 3つ目(達成したセットを削除するとバッジが消える)の正体はここ。`personalBests`自体からは削除していない(`applyPersonalBest`はセット削除時には呼ばれない)が、表示のたびに存在確認することで結果的に消える |

`achievement`(C1・C2)側も同じ形で、`ref<Achievements | null>(null)`という同じくローカルの状態に`applyAchievements()`で積むだけ。種目単位ではなくworkout単位の達成のため`Map`ではなく単一の`ref`だが、「`useState`を使わない」「保存APIの戻り値をそのまま使う」という設計は共通している。

### 3. 自分で壊して確かめる

- `personalBestFor()`の`!session.value.sets.some((s) => s.id === personalBest.setId)`の部分を外し、`if (!personalBest) return null`だけにして保存する(HMRで反映)。その状態で、①重い重量のセットを保存してバッジを出す→②そのセットを削除する、という手順を踏むと、**セットが無くなったのにバッジ(達成した重量の表示)だけ画面に残り続ける**(実際に試すとそうなる)。「表示する直前に実在確認をする」という1行が無いと、削除したはずのものがいつまでも見えてしまうことが体感できる。**試したら必ず元に戻すこと**

## 具体例13から読み取れる設計上の判断

- **サーバーと同じ実体を持つ状態と、この画面だけの記憶を分けて持つ** — `session`(`useState`。②ホームや別のタブからも見える、サーバー上のセット一覧の写し)と`personalBests`・`achievement`(`reactive`/`ref`。このページのコンポーネントインスタンスだけが持つ)を明確に分けている。具体例6の`unreadCount`(`useState`で複数画面から共有する状態)とは逆に、こちらは「他の画面には要らない、今この瞬間の演出」なので意図的に共有しない設計
- **「表示してよいか」を保存時ではなく表示時に毎回確認する** — `personalBestFor()`は`personalBests`に値があってもそのまま信用せず、`session.value.sets`(達成したセットが今も存在するか)と突き合わせてから返す。バックエンドの`findVisibleNotifications()`(具体例6)が取得のたびに「表示してよいか」を再確認するのと同じ考え方を、フロント側のローカル状態に対しても適用している
- **削除時に専用の後始末コードを書かない** — セット削除(`onDeleteSet` → `removeSet()`)は`personalBests`や`achievement`を一切触らない。「削除時にバッジも消す」という処理を個別に書く代わりに、表示側(`personalBestFor()`)の実在確認1つに任せることで、削除の実装を素朴なまま保っている

## 次に読むと理解が深まるファイル

- `frontend/app/composables/useAuth.ts`の`logout()` — ログアウト後にあえてフルリロードする理由(Issue #245)
- `frontend/app/middleware/` — 未ログイン時のリダイレクトなど、ページ遷移前のガード
- `frontend/app/composables/useGroups.ts`の`ERROR_MESSAGES` — バックエンドのエラーコードと日本語メッセージの対応関係一覧
- `frontend/app/pages/workouts/new.vue`の`onApplyRoutine()` — ルーティンをワークアウト作成に適用すると、目安セットが(デフォルト値ではなく)実際の重量・回数で一括登録される。具体例1・4で見た「デフォルト値で即登録」とは異なるもう1つの適用パターン
- `frontend/app/pages/mypage/password.vue` — 具体例9では扱わなかった、ログイン中にその場でパスワードを変える方の画面。成功後は完了表示に切り替わるだけで画面遷移しない点が、`/password-reset/[token]`(成功後に`/login`へ遷移)との違い
- `docs/spec.md` §3-3 — 画面をまたぐ状態の持ち方の一覧
