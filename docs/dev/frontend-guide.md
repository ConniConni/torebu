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

## 具体例：ワークアウト記録を1件作るとき

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

## この例から読み取れる設計上の判断

- **API呼び出しは`pages/`に直接書かず、composableに集約する** — ページ(`.vue`)はUIの表示とユーザー操作のハンドリングに専念し、「何を・いつAPIに送るか」のロジックはcomposable側が持つ。同じデータを複数の画面で使う場合に重複を避けられる
- **キャッシュの更新漏れに注意する** — `useWorkouts()`のような一覧データを`useState`でキャッシュしている箇所は、保存操作のたびに変わりうる値(前回実績・集計値など)を持たせると、更新処理を書き忘れたときにページ遷移後も古い値が残り続けるバグになりやすい(過去にIssue #116で発覚した)。新しくcomposableを書くときはこの点を意識する

## 次に読むと理解が深まるファイル

- `frontend/app/composables/useAuth.ts` — ログイン状態の判定・SSR時のCookie転送の扱い
- `frontend/app/middleware/` — 未ログイン時のリダイレクトなど、ページ遷移前のガード
- `docs/spec.md` §3-3 — 画面をまたぐ状態の持ち方の一覧
