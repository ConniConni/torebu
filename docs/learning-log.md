# 学習ログ

技術の勉強を兼ねているので、実装しながら気づいたこと・詰まったこと・理解できたことをここに書き残す。
「なんとなく動いた」で終わらせず、**なぜそう実装したかを自分の言葉で書く**のが目的。

書き方の目安：

- 完璧な文章でなくてよい。箇条書き・殴り書きでOK
- 「わからなかったこと」もそのまま書く（後で見返して成長がわかる）
- 日付ごとに追記していく（新しい方を上に）

## 効果的に書くためのコツ

**タイミング**

- そのセッション／作業がひと段落したタイミングで、**記憶が新しいうちに**書く。翌日以降にまとめて書こうとすると、細部が抜けて「なんとなく理解した気がする」で終わりやすい
- 1 Issue = 1セッションの区切りと相性がいいので、PRを出す前後に書くのを習慣にする

**書き方**

- **何も見ずに、自分の言葉で説明できるか試してから書く**（検索や会話ログを見返すのは、書けなくて詰まってから）。これが一番の理解度チェックになる
- 「なぜそれを選んだか」を書く。「Vitestを使った」ではなく「NuxtがViteベースだからVitestが噛み合う、と理解した」のように理由まで書く
- わからなかったことは誤魔化さずそのまま書く。「〇〇がなぜそうなるのか分からなかった」は次に潰すべき課題のリストになる

**書いた後**

- ある程度溜まったら`/review`で復習問題を出してもらい、実際に説明できるか確認する
- 何度も引っかかる概念があれば、次のセッションの最初に「〇〇についてもう一度説明して」と聞き直す

---

## テンプレート（コピーして使う）

### YYYY-MM-DD

## **やったこと**

## **学んだこと・気づいたこと**

## **わからなかったこと・詰まったこと**

**見積もりの振り返り**

- 見積もり： / 実績：
- ズレた場合、原因は何か：

## **次回やること**

---

### 2026-09-01 18:00

**やったこと**

- Issue3「DBスキーマの実装（Prismaモデル定義・マイグレーション）」を実施：`docs/schema.md`のMVP7テーブルをPrismaモデルとして定義、ローカルDBにマイグレーション適用、PR作成

**学んだこと・気づいたこと**

- `schema.prisma`を書き換えてから`prisma migrate dev`を実行するまでの間で、Prismaは何をしているか（差分の検出→SQL生成→DB適用）を自分の言葉で説明できるか
  - 1. 現在のschema.prismaと、過去に適用済みのマイグレーション履歴を比較して差分を検出
  - 2. 差分からSQLを生成（migration.sqlとして書き出す）
  - 3. そのSQLをDBに適用
  - 4. 最後にPrisma Client（TypeScriptコード）を再生成（これがprisma generate相当の処理。手動でprisma generateコマンドを別途打つのではなく、migrate devが内部で自動的にやってくれる部分）
  - prismaを使うことで差分をおいやすくgitでの管理も可能になる。
- `prisma migrate dev --create-only`と、オプション無しの`prisma migrate dev`は何が違うか。今回どちらを、どんな場面で使い分けたか
  - 前者はSQLを生成するだけ、後者はDB適用で実施する。DB適用前に生成したSQlを確認したい時に前者を使う
- 生成された`migration.sql`を読むために最低限必要な知識は何だったか（`CREATE TABLE`/`CREATE TYPE`/`ALTER TABLE ... ADD CONSTRAINT`/`FOREIGN KEY ... ON DELETE ...`など、出てきたSQL構文を自分の言葉で説明できるか）
  - `CREATE TABLE` デーブル生成
  - `CREATE TYPE` 独自の型を新しく定義
  - `ALTER TABLE ... ADD CONSTRAINT` 制約を追加
  - `FOREIGN KEY ... ON DELETE ...` 参照先の行が削除されたとき、この外部きーを持つ行をどう扱うかの設定

- `TIMESTAMP`と`TIMESTAMPTZ`は何が違うか。今回`docs/schema.md`の設計と実際に生成されたSQLがズレていたのはなぜ起きたか（Prismaの`DateTime`型のデフォルトマッピングはどうなっているか）
  - タイムゾーンの指定なしの時間かありの時間か 考慮漏れのため
- Prisma 7で「ドライバアダプター」が必須になったとは、具体的に何がどう変わったということか。以前のPrisma（6以前）とどう違うか
  - PrismaがDB(PostgreSQL)と通信するために`@prisma/adapter-pg`が必要となったこと
- `exercises`の公式種目名の部分UNIQUE制約について、DB制約を見送るという判断をした理由は何だったか（レースコンディションとは何か、なぜ「1人運用」だとリスクが下がると考えたか）
  - 運用側が複数人で`exercises`登録するケースが考えらないので過剰な設計となる恐れがあるため
- `prisma migrate reset`はどんな時に使うコマンドで、なぜ実行前にPrisma自体から確認を求められたか
  - DBの実データが消える操作のため　今回はまだリリースもしていないし、テーブルを作っただけで影響が限定的だったため実行

**わからなかったこと・詰まったこと**

- （自分の言葉で書いてみる）

**見積もりの振り返り**

- 見積もり：60分 / 実績：80分
- 振り返りの時間がどうしても時間がかかる 生成自体は逆にClaude Codeがほぼ行ったため20分程度　あとはわからないことを聞いたりで時間を使った。

**次回やること**

- Issue3「DBスキーマの実装」に着手 → 完了
- Issue4「ユーザー登録・ログイン（セッション認証）API」を起票

---

### 2026-09-01 15:00

**やったこと**

- Issue2「バックエンド（Express）の初期セットアップ」を実施：Express 5 + TypeScript初期化、ESLint/Prettier導入、Prisma導入、Docker ComposeでローカルPostgreSQL構築、Vitest+supertestで最小テスト、README追記、PR作成〜main取り込み

**学んだこと・気づいたこと**

- `npm`の`latest`タグが必ずしも「安定版」を指すとは限らないと知った。今回`prisma`の`latest`は8だったか、7が安定版だった。
- Prisma 7から`schema.prisma`と接続設定の役割がどう分かれたか（`prisma7.config.ts`が担うようになったものはマイグレのファイルの出力先とDBにアクセスするための情報の場所）
- `tsconfig.json`の`include`に入っていないファイルは「そのtsconfigのプロジェクトの一部として扱われない」。エディタ（VS Code）は簡易的に型チェックを行った。
- `@types/node`とはNode.js固有のAPIの型定義をまとめたパッケージでprocessなどを使えるようにしているパッケージである。
- `rootDir`はtsconfig.jsonで明示的に指定した"rootDir": "src"という設定値を基準に計算しているため`prisma7.config.ts`を`include`に入れることでカレントの外にあるファイルとして競合が発生した
- `tsconfig.json`と`tsconfig.build.json`、前者は型チェックだけして、出力(.js)は作らない（noEmit: true。エディタ・npm run typecheck用）ために、後者はtsconfig.build.json → 実際に.jsへコンパイルしてdist/に出力する（npm run build用）
- `extends`はtsconfig.json`の内容を読み込み、残りは差分だけを書けばいいことになる。
- Vitestの`describe`/`it`/`expect`、はそれぞれテスト区分、（１つの）テストケース、実行（判定）を担う
- `supertest`はExpressアプリに対して「実際にHTTPリクエストを送ったふりをする」ためのライブラリ。`app.listen()`を`NODE_ENV !== 'test'`で分岐させていたのはapp.listen() は、Expressで指定したホストとポートで接続を待ち受ける（HTTPサーバーを起動する）ためのメソッドであるが、supertestはappさえ渡せばサーバーを立ち上げてくれ、不要であるから。

**わからなかったこと・詰まったこと**

- `npm install`で`Cannot read properties of null (reading 'edgesOut')`エラーが再発したが、前回（frontend）と原因は同じで`nvm use`でnodeのv22を使用することで解決した。
- `docker exec -it backend-db-1 /bin/bash`が失敗した。原因は1つで、コンテナが立ち上がっていなかったから。立ち上がっていない理由はデータバインドの設定がv18以前とv18で異なっていたため

**見積もりの振り返り**

- 見積もり：60分 / 実績：80分
- わからないことをClaude Codeに聴きながら作業を勧められた/振り返りで結構時間がかかってしまった。

**次回やること**

- Issue2「バックエンド（Express）の初期セットアップ」に着手 → 完了
- （次のIssueをここに）

---

### 2026-08-31 21:30

**やったこと**

- Nuxt.js＋TypeScriptでfrontend/ディレクトリ作成
- ESLint,Prettierを導入(コマンドで実行できるようにする `npm run lint`, npm run format:check[write]`)
- node.jsのバージョンが悪さをしたのでLTSv22への切り替えと切り替えを`nvm use`コマンドで行えるようにすること

**学んだこと・気づいたこと**

- package.jsonに書き込むことでスクリプトとして機能することを思い出した（忘れていた）
- ~~eslint.config.mjsのおかげでVue/Nuxtで利用できる便利な機能が使えること(理解あっている？)~~
- eslint.config.mjsのおかげでVue/Nuxtで利用できる useFetchとかrefとかNuxtが自動importする関数を、ESLintが『未定義変数』と誤検知しないよう、Nuxt公式が用意した設定をwithNuxtで取り込んでいる

**わからなかったこと・詰まったこと**

- 特になし

**見積もりの振り返り**

- 見積もり：30分 / 実績：60分
- ズレた場合、原因は何か：nodeのバージョンやTypeScriptのバージョン違いでエラーが起きたこと/ESLint,Prettierの理解の時間を考慮していなかったこと

**次回やること**

- バックエンド（Express）の初期セットアップのIssueを起票

---

### 2026-08-31 17:00

**やったこと**

- （DBホスティングをNeon/Supabase/Render/Railwayで比較して、Neonに決めた）
- （テストツールをVitestに決めた）
- （GitHubの開発フロー：ブランチ命名・コミット粒度・Issue/PRテンプレートを整備した）
- （セッションの区切り方（1 Issue = 1セッション）を決めた）
- （Issue1「Nuxtプロジェクトの初期セットアップ」を実施：Nuxt4初期化、TypeScript/vue-tsc導入、ESLint/Prettier導入、README作成）

**学んだこと・気づいたこと**

- マネージドPostgresサービスを比較するとき、何を基準に見たか、自分の言葉でまとめてみる（無料枠の持続性、放置耐性、バンドル機能の有無など）
- SupabaseとNeon、それぞれ何が違うのか。なぜ今回はNeonの方が合っていたのか
- VitestとJestは何が違うのか。なぜNuxt（Vite製）のプロジェクトだとVitestの方が噛み合うのか
- ブランチ命名・コミットの粒度のルールを、なぜそう決めたのか（自信が無かった理由は何だったか）
- IssueとPRの役割の違いは何か（「Issueのコピーになってしまう」を防ぐには、何を意識すればいいか）
- ESLintとPrettierは何が違うのか。なぜ両方を入れる必要があったのか、自分の言葉で説明できるか
- `eslint.config.mjs`の`withNuxt(...)`は何をしていたか。`.nuxt/eslint.config.mjs`との役割分担はどうなっていたか
- `dependencies`と`devDependencies`は何が違うのか。ESLint/Prettier/TypeScriptがdevDependencies側に入るのはなぜか
- `npm install -D`は何をするコマンドか（既存の依存関係を消して入れ直しているわけではない、という理解は合っているか）

**わからなかったこと・詰まったこと**

- `npm install`実行時に`Cannot read properties of null (reading 'edgesOut')`というエラーが出た。原因は何だったか、Node.jsのバージョンとどう関係していたか、自分の言葉で説明してみる
- `typescript@^7`を入れたら`vue-tsc`が動かなくなった。何が原因で、どう対処したか

**見積もりの振り返り**

- 見積もり：（Issueに書いた想定時間を転記） / 実績：
- ズレていたら、何が原因だったか（npmのバグ・バージョン起因の詰まりは想定していたか、など）

**次回やること**

- Issue1「Nuxtプロジェクトの初期セットアップ」に着手 → 完了
- バックエンド（Express）の初期セットアップのIssueを起票

---
