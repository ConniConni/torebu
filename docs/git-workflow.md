# Git / GitHub 運用ルール

変更の経緯を後から追えるようにし、問題があれば戻せるようにするため、mainに直接コミットせず
**ブランチ → コミット → プルリク → マージ**の流れで進める。
Issue・PRの作成はClaudeが`gh`コマンドで行い、マージはユーザーが行う。

> ⚠️ **`gh`コマンドが`HTTP 401: Bad credentials`で失敗する場合**：環境変数`GITHUB_TOKEN`が
> 設定されていて`gh`本来の認証を上書きしてしまっているのが原因のことが多い。次のコマンドで
> `GITHUB_TOKEN`を一時的に外してログインし直す：
>
> ```bash
> env -u GITHUB_TOKEN gh auth login
> ```
>
> 上記の対処のため、以後`git push`・`gh issue create`・`gh pr create`などは
> `env -u GITHUB_TOKEN`を前置きして実行する運用にしている（恒久対応であるシェル起動ファイルでの
> `GITHUB_TOKEN` unsetは対応しない方針。2026-09-04時点）。ただし、この前置きが原因で
> **認証が直った後もユーザー確認を求められ続けることがある**：Claude Codeの許可ルール
> （`Bash(git push:*)`等）はコマンド文字列の前方一致なので、`env -u GITHUB_TOKEN git push ...`は
> 素の`git push`ルールにマッチしない。この場合の許可ルールは個人用の`.claude/settings.local.json`
> （gitignore対象、Git履歴に残らない）に`env -u GITHUB_TOKEN`付き・無し両方のパターンで追加している。
> 開発環境を作り直したときは、このファイルが無くなっているため同じ確認プロンプトが復活しうる

## 全体の流れ

0. **新しいIssueを立てる前に、ローカルの`main`をリモートの最新に合わせる**
   ```bash
   git switch main && git pull origin main
   ```
   （詳細・理由は次節「作業開始前に`main`を同期する」参照）
1. Issueを立てる（やることを言語化する）
2. Issueに対応するブランチを切る
3. 作業してコミットを積む
4. プルリクを作る（`closes #番号`でIssueと紐付ける）
5. セルフレビューし、CIが通ったらマージ（CIが失敗しているとマージできない。後述「CIとブランチ保護」参照）

## 作業開始前に`main`を同期する

**新しいIssueを立てる／新しいブランチを切る前に、必ず`git switch main && git pull origin main`でローカルの`main`をリモートの最新に合わせる。** セッション開始時にツール側が一度だけ表示するgit statusのスナップショットは、その後にリモートで起きた変更（他セッションが並行してマージしたPR等）を反映しない。これを鵜呑みにしたまま棚卸し・Issue起票・ブランチ作成に進むと、**既にmainで対応済みの作業と丸ごと重複してしまう**。

> **2026-09-26に実際に発生した事例**：`docs/dev/backend-guide.md`・`docs/dev/frontend-guide.md`の
> 「開発者向けガイド拡張」で、直前のセッションがチェックリストを完了とマークした直後、2つの
> 独立したセッションがほぼ同時に「次の対象機能」の棚卸しを行い、どちらも独立に「パスワードリセット」を
> 選んでしまった。片方のセッション（Issue #288 → PR #289）が先にマージされたが、もう片方の
> セッションはセッション開始時のgit statusスナップショット（`main`が`9d027e7`のまま）を見て
> ブランチを切ったため、実際にはその後mainにマージ済みだった「具体例9」と丸ごと重複するIssue
> （#290）・PR（#291）を作ってしまった。原因は、後者のセッションが着手前に`git pull`で
> リモートの最新状態を確認していなかったこと。結果、実装済みの内容を読み比べて
> `password-changes`部分だけを新しい具体例として切り出す、という手戻りが発生した。
>
> このプロジェクトは複数セッションを並行して走らせるバイブコーディング運用のため、
> 特にこの確認を省略しないこと。

## 実装中・動作確認中に出てきた気づきの扱い

画面が実際に動くようになると、書いた仕様だけでは出てこなかった気づき（もっとこうしたい、という
改善アイデア）が必ず出てくる。これ自体は自然なことなので止めなくてよいが、**気づいた瞬間にその場で
直すかどうかを都度判断する**と、今のIssueの完了がどんどん後ろに伸びたり、コミットに「Issueの実装」と
「思いついた改善」が混ざってレビューしづらくなったりする（手戻りの原因）。

気づいたことは、まず次のどちらかに分類する：

- **バグ**：Issueの完了条件・既存の仕様に対して明らかに動作がおかしい（例：ボタンを押しても反応しない）
  → 今のIssue内で直してよい
- **アイデア・改善**：「あったらもっと良い」「こうした方が使いやすいかも」（例：入力方式を変えたい、
  新しい導線が欲しい）
  → **その場では直さない**。`docs/backlog.md`に一言メモを残して、元の作業に戻る。
  メモには「何が理由で」「いつ再検討するか」（再検討のタイミング）を添えると、後で拾いやすい

溜まったメモは、1 Issueが終わって次のIssueを選ぶタイミングでまとめて見返し、Issue化する価値がある
ものだけを次のIssueの候補にする。新しい仕組みは増やさず、既存の「1 Issue = 1セッション」の区切りを
そのまま使う。

## ブランチ名

```
<type>/<3〜5語の短い説明（英語・kebab-case）>
```

`type`はコミットの種別と揃える：`feat` `fix` `docs` `chore` `refactor` `test`

**例**
- `feat/workout-recording` — トレーニング記録機能
- `feat/exercise-picker` — 種目選択画面
- `fix/session-expiry-bug` — セッション失効まわりの不具合修正
- `docs/update-schema` — スキーマドキュメントの更新
- `chore/setup-prisma` — Prismaの初期セットアップ

**迷ったときの目安**：「このブランチ、何をするためのものか一言で言えるか？」言えなければ、そのブランチでやろうとしていることが大きすぎる可能性が高い。

## コミット

グローバル設定（Conventional Commits）に準拠。`feat:` `fix:` `docs:` `chore:`など。迷ったら`chore:`でよい。

**粒度の目安**
- 1コミット＝**1つの意味のある変化**。「このコミットは何をした？」に一言で答えられる単位に区切る
- 「動く状態を保ったまま説明できる単位か」をチェック。動かない状態のコミットが続くのはNG
- 大きくなりすぎたら、機能単位ではなく「作業のステップ単位」で分けてみる
  - 例：「種目選択画面」なら → `feat: 種目一覧のAPIを追加` → `feat: 種目選択画面のUIを実装` → `feat: 部位ごとのセクション分けを追加`、のように分割できないか考える
- 逆に、些細な修正（typo、フォーマット直し）を独立コミットにしすぎない。作業中のコミットに含めてOK

**迷ったら小さめに割る方が安全**：後からsquash（複数コミットを1つにまとめる）はできるが、大きすぎるコミットを後から分割するのは大変なため。

## Prismaマイグレーションを後から修正するとき

**push前（他の環境と未共有）のマイグレーションを内容変更する場合、`prisma/migrations/*/migration.sql`の
編集と、ローカルDBへの反映を必ず同じ手段（Prismaコマンド経由）で行う。** ファイルだけ手で書き換えて、
DB側は別の生SQLで手動パッチする、という2系統をバラバラにやらない（Issue #158で実際にやってしまい、
`_prisma_migrations.checksum`（適用時に記録される、そのマイグレーションファイルの中身のハッシュ値）が
ファイルの現在の中身と食い違う状態になった。たまたま`migrate status`・`migrate deploy`はエラーに
ならなかったが、本来Prismaが保証する「ファイルの中身どおりにDBができている」という前提が崩れていた）。

**正しい直し方（データを消さずに）**：
1. `prisma/migrations/*/migration.sql`とスキーマ（`schema.prisma`）を編集する
2. ローカルDBへの反映は、既存データが影響を受けないことを確認した上で、編集後のSQLと**同じ内容**を
   手動で流すか、あるいは対象カラムが空（NULL）であることを確認した上でカラム単位の`ALTER`で反映する
3. **`_prisma_migrations.checksum`を、編集後のファイルの実際のSHA256に更新する**
   （`shasum -a 256 <migration.sql>`で計算し、`UPDATE _prisma_migrations SET checksum = '...' WHERE migration_name = '...'`）。
   これを忘れると、ファイルとDBの記録が食い違ったまま気づかれずに残る
4. `prisma migrate status`で「up to date」になることを確認する

**`prisma migrate reset`は使わない**（Prisma CLI自体がAIエージェントによる実行を拒否し、明示的な
ユーザー同意を求める安全装置がある。データを全削除して作り直す動作のため、ローカル開発用DBであっても
実行前に必ずユーザーに確認する。詳細はIssue #158のセッションログ参照）

## ブランチ戦略

**GitHub Flow**（作業ブランチ → PR → `main`へマージ）で運用し、**`main`＝本番**とする
（2026-10-17、本番運用の開始を受けて再検討した結果、維持すると決めた）。

- `develop`・`staging`のような常設ブランチは作らない。一人開発で1日に数回マージする規模では、
  ブランチ間のマージの手間と、並行セッション同士がぶつかる箇所が増えるだけになるため
- **急ぎの修正（hotfix）も通常の`fix/`ブランチ → PRで出す**。`main`がそのまま本番なので、専用の
  hotfixブランチは作らない。CIも通常どおり通す
- 「本番に出す前に確かめる」役割は、ブランチではなく**CI（自動チェック）**と**Preview環境**
  （PRごとにVercelが作るお試し版のサイト）が担う。Preview環境のDBは本番から切り離してある
  （下記「Preview環境のDBを本番から切り離す」参照）

## CIとブランチ保護

Issue #377（2026-10-18）で導入した。

- **CI**：PRを作ったとき・PRのブランチにpushしたとき・`main`にpushされたときに、GitHub Actions
  （[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)）がbackend・frontendそれぞれで
  `typecheck`・`lint`・`test`を実行する。結果はPRの画面に✅／❌で表示される
  - backendのテストは、ジョブの間だけ起動する使い捨てのPostgreSQLに`prisma migrate deploy`してから
    実行する（本番のNeon・ローカルのDBには一切つながらない）。backendのジョブは4〜5分ほどかかる
  - docsだけのPRでもCIは全部走る（変更したファイルで絞り込むと、必須チェックが「結果待ち」のまま
    止まってマージできなくなるため、あえて絞り込んでいない）
  - `format:check`（Prettierの書式チェック）は既存ファイルに未修正の差分があるため、まだ入れていない
    （[backlog.md](./backlog.md)「技術的負債」参照）
- **ブランチ保護**（GitHubの`main`ブランチの設定）：
  - CI（`backend`・`frontend`の2ジョブ）が通っていないPRはマージできない
  - `main`への直接pushは禁止。必ずPRを経由する（`main`の強制push・削除も禁止）
  - **管理者（リポジトリのオーナー）にも適用している**。ClaudeはオーナーのGitHub認証で操作して
    いるため、適用しないとClaudeが保護をすり抜けて直接pushできてしまう（2026-10-17、ユーザー判断）
  - レビュー承認の必須化はしない（自分のPRを自分で承認できず、全部のマージが止まるため）
  - 「マージ前にブランチを最新にする」の必須化もしない（並行セッションのPRがマージされるたびに、
    他のPRの最新化と再実行が必要になるため）
- **CIが落ちたとき**：まず失敗したジョブのログを見て直す（`env -u GITHUB_TOKEN gh pr checks <番号>`、
  詳細は`env -u GITHUB_TOKEN gh run view <run-id> --log-failed`）。CI自体の不具合（GitHub側の障害等）で
  急ぎの修正がどうしても出せない場合に限り、オーナーがGitHubの設定画面でブランチ保護を一時的に外して
  マージし、**直後に必ず元に戻す**

## 本番環境（Vercel）への反映について

Issue #181（2026-09-15）でVercelへの本番デプロイに対応して以降、`main`へのマージは
**即座に本番サイトへ反映される**（Vercelのproduction環境がGitHub連携で`main`ブランチを
自動デプロイする設定のため、別途「本番に反映する」操作は無い）。以下を徹底する：

- **データベースの設計変更（マイグレーション）を含むPRは、「本番DB（Neon）に`prisma migrate deploy`を
  手動実行 → その後マージ」の順で出す**（2026-10-17に「マージの前後どちらか」から変更）。Vercelのビルドが
  自動で行うのはPrisma Client（コード側のDB操作ライブラリ）の生成だけで、実際のテーブル構造の変更は
  含まれない。忘れると、新しいコードが古いテーブル構造に対して動くことになりエラーになる。
  - この順番にすると、マージするまでの間は**古いコードが新しいテーブル構造に対して動く**。そのため
    **マイグレーションは、古いコードのままでも動く形でしか書かない**：
    - カラム・テーブルの**追加**は、そのまま1つのPRでよい（古いコードは新しいカラムを使わないだけ）。
      ただし`NOT NULL`のカラムを追加するときは既定値（`DEFAULT`）を付ける（付けないと、古いコードの
      `INSERT`がそのカラムを指定せずに失敗する）
    - カラム・テーブルの**削除・名前変更**は2つのPRに分ける：①新しいカラムを追加し、コードをそちらに
      切り替える → ②古いカラムを使うコードが本番から無くなったのを確認してから、古いカラムを削除する
  - 理由はもう1つある：frontendとbackendは別々のVercelプロジェクトで、両方を変えたPRでも**同時には
    本番に反映されない**。また、問題が起きてVercelで前のデプロイに戻しても（下記「問題が起きたときの
    戻し方」）、**DBのテーブル構造は一緒に戻らない**。どちらの場合も、古いコードが新しいテーブル構造で
    動ければ壊れない
  **`prisma migrate deploy`を打つときは以下の点に注意する**（Issue #228のPR対応中、2026-09-23に
  実際に詰まった。詳細はメモリ`neon-production-migrate-deploy`参照）：
  1. 接続文字列は**Vercelではなく[Neonコンソール](https://console.neon.tech)から取る**
     （Vercelの環境変数は一度セットすると値が再表示できないため）
  2. **pooled（ホスト名に`-pooler`が付く）ではなくdirect接続を使う**。`migrate deploy`は
     マイグレーション中にアドバイザリロックを取得し同一セッション前提で動くため、pooled接続だと
     失敗・ハングしうる。Neonコンソールの接続ダイアログで「Pooled connection」をOFFにしてコピーする
     （アプリ実行時のVercelの`DATABASE_URL`は逆にpooled推奨。torebuは`DIRECT_URL`を分けておらず
     `DATABASE_URL`1本の構成なので、マイグレーションを打つときだけ一時的にdirect接続の値に差し替える）
  3. Neonの接続文字列は`?sslmode=require&channel_binding=require`のように**`&`を含む**ため、
     `DATABASE_URL=postgresql://... npx prisma migrate deploy`のようにクォートせず1行で渡すと、
     シェルが`&`の位置でコマンドを分割してしまい、`DATABASE_URL`がセットされないまま実行される
     （気づかずローカルDBに対して実行してしまう事故につながる）。必ず`export`＋ダブルクォートで
     値全体を1つの文字列として渡し、`migrate status`で接続先（`Datasource`行のホスト名）が
     本番Neonになっているか確認してから`migrate deploy`を実行する
  4. **接続文字列（パスワード入り）をターミナルの画面・履歴・環境変数に残さない**（2026-10-03追加）。
     `export DATABASE_URL="..."`と直接打つと、値が画面に表示されたうえシェルの履歴にも残る。
     `read -rs`で画面に表示せずに受け取り（履歴にも残らない）、作業が終わったら`unset`で消す。
     `read -rs`はbash・zshのどちらでも動く：
     ```bash
     cd backend
     printf 'Neonのdirect接続文字列: '; read -rs DATABASE_URL; echo; export DATABASE_URL
     npx prisma migrate status   # Datasource行のホストがneon.tech（-poolerなし）か確認してから
     npx prisma migrate deploy
     unset DATABASE_URL          # 終わったら必ず消す（ローカル開発時は.envの値に戻る）
     ```
     貼り付けても何も表示されないのが正常（そのままEnterを押す）。
     **うっかり`export DATABASE_URL="..."`と打ってしまった場合**は、その行を打ったターミナルのタブで
     以下を実行して履歴から消す（bashの場合）：
     ```bash
     unset DATABASE_URL
     history | grep DATABASE_URL   # 行頭の番号を確認
     history -d <番号>             # 複数あるときは番号の大きい方から消す（先に小さい方を消すと番号がずれる）
     history -w                    # 消した後の履歴で~/.bash_historyを上書きする
     clear                         # 画面に残った表示も消す
     ```
     別のターミナルのタブが開いていると、そのタブを閉じたときに古い履歴がファイルへ書き戻されることがあるため、
     作業したタブで実行する
  5. 初回の`P1001: Can't reach database server`は、停止していたNeonが起動するのを待っているだけのことが
     多い。`Datasource`行のホストが正しければ、数秒おいて同じコマンドを再実行すれば通る
- PRに新しい環境変数（`SESSION_SECRET`のような秘密情報や設定値）が必要になった場合は、
  マージ前にVercel側（バックエンド・フロントエンドそれぞれ）のダッシュボードで設定しておく
- PreviewデプロイのDBは、本番とは別のNeonブランチ（Preview用）を見ている（2026-10-22、Issue #380）。
  Preview環境での動作確認は本番の実データに影響しない。詳細は下記「Preview環境のDBを本番から切り離す」
- **バックエンドのVercel関数は`backend/vercel.json`の`regions`でNeonの実リージョン（Sydney＝`syd1`）
  に明示的に合わせている**（Issue #192）。指定が無いとVercelのデフォルトリージョン（米国）で動き、
  すべてのAPIリクエストが「日本→米国→Sydney→米国→日本」という経路になって数百ms〜1秒近い
  レイテンシが乗る。Neon側のプロジェクトを別リージョンに作り直す場合は、この設定も合わせて変更すること

## Preview環境のDBを本番から切り離す

Issue #380（体制整備B）で2026-10-22に実施済み。以下は、そのときの設定内容と手順（作り直すときの参照用）。
コード側は、frontendの転送にバイパスヘッダーを付けるだけ（`frontend/nuxt.config.ts`）。残りはVercel・Neonの
ダッシュボードでの設定で、オーナーが行う。

構成：全PR共通の「Preview用Neonブランチ」1つ ＋ 固定の「Preview用backend」1つ。PRのfrontendの
Previewは、常にそのPreview用backendへ転送する。backendのPreviewはVercel Authenticationで保護されて
いるため、frontendの転送（サーバー側）には`x-vercel-protection-bypass`ヘッダーで保護を通過させる。

1. **Neonで「Preview用ブランチ」を作る**（Neonコンソール → Branches → Create branch）。
   本番データをコピーしない（「Schema-only」を選ぶ。選べない場合は作成後に全テーブルのデータを消す）。
   無料プランはブランチ10個/プロジェクトまでなので、PRごとには作らない
2. **Preview用ブランチのdirect接続文字列にマイグレーションを流す**（手順は上記
   「`prisma migrate deploy`を打つときは…」と同じ。接続先をPreview用ブランチにする）。
   以後、マイグレーションを含むPRは**Preview用ブランチにも`migrate deploy`する**
   （しないとPreview用backendが古いテーブル構造で動く）。
   Schema-onlyのブランチは、データだけでなく**適用履歴（`_prisma_migrations`）も空**で、テーブルは既にある。
   そのため`migrate deploy`ではなく、`prisma migrate resolve --applied <名前>`を全マイグレーションに対して
   実行して、適用済みとして記録した（`migrate status`が「up to date」になればよい）。
   続けて、公式種目を入れる：`npm run prisma:seed`（Preview用ブランチの接続文字列で。ユーザー・記録には触れない。
   入れないと、Previewで記録を付けるときに種目が1件も出ない）。
   接続先が本番でないことは、必ず`migrate status`の`Datasource`行のホストで確認してから実行する
3. **backendのVercelプロジェクト**：
   - Settings → Deployment Protection → Protection Bypass for Automation →「Add Secret」
     （値の欄は空のまま。Vercelが32文字の値を生成する）で、シークレットを作って控える
   - 環境変数`DATABASE_URL`を、**Preview専用**（値＝Preview用ブランチのpooled接続文字列）と
     **Production専用**（値＝本番ブランチのpooled接続文字列）の2行に分ける。やり方は下記「共有の環境変数を
     ProductionとPreviewに分けるとき」
4. **Preview用backendのURLを決める**：`main`と別に`preview`ブランチを用意し、そのブランチのbackendの
   Previewデプロイのブランチ固定URL（`torebu-git-preview-<チーム>.vercel.app`）を使う。
   `main`と同じコミットだとVercelがデプロイを作らないので、空コミットを積んで作る。
   backendの変更を含むPRをPreviewで試すときは、そのブランチを`git push -f origin <PRのブランチ>:preview`
   で`preview`に反映する（frontendだけのPRでは不要）
5. **frontendのVercelプロジェクト**：
   - `BACKEND_ORIGIN`を、**Preview専用**（値＝手順4のURL。末尾に`/`を付けない）と
     **Production専用**（値＝本番backendのURL）の2行に分ける（下記の手順で）
   - `PREVIEW_BACKEND_BYPASS_SECRET`をPreviewだけに新規追加（値＝手順3のシークレット、Secret）
6. **確認**：PRのPreviewでログイン・記録の作成ができ、その内容が**本番サイトに出ない**こと
   （本番では見えず、Preview用ブランチのDBにだけ入っていること）

### 共有の環境変数をProductionとPreviewに分けるとき

`DATABASE_URL`・`BACKEND_ORIGIN`のように、ProductionとPreviewで1行を共有しているSecret（値が後から
見えない）を分ける手順（2026-10-22、Issue #380で実施。以下で詰まった）：

- **Vercelは、Secretの環境だけを変えて保存することも、同名の変数を同じ環境に重ねて追加することもできない。**
  値の欄を空のまま保存すると本番の値が消える恐れがあり、`preview`ブランチ指定で同名を追加しようとしても
  「already exists」で拒否される
- **Production画面（Settings → Environments → Production）から編集すると、Productionを外せない。**
  **Preview画面から**編集すれば、Previewだけに絞れる
- 手順：①Preview画面で既存の行を開き、値をPreview用に入れ直して、環境を**Previewだけ**にして保存する
  （「removed from Production」の警告は想定どおり）→ ②続けて、同名の変数をProductionだけに新規追加する
  （値は本番の値。Neonの本番ブランチ、または本番backendのURLから取り直す）→ ③本番をRedeployして、
  本番サイトでログインできることを確認する（失敗したら前のデプロイをPromote to Productionで戻す）
- ①の保存後に出る「Redeploy」のダイアログは**Dismiss**する（①と②の間は本番の値が無い状態のため）。
  ①〜②の間は`main`へのマージや再デプロイをしない。動いている本番のデプロイは、環境変数を作成時に固定して
  使うので影響を受けない
- 環境変数の変更は**新しいデプロイにだけ反映される**。変更後は、該当のデプロイをRedeployするか、新しいコミットを
  pushする

## Node.jsのバージョンとセキュリティリリース

Issue #382（2026-10-22）で、使うNodeのバージョンをリポジトリに明示した。

- **Node 24.x に揃えている**。`backend/package.json`・`frontend/package.json`の`engines.node`（`"24.x"`）が
  指定元で、次の3か所がここを見る：
  - **本番・Preview（Vercel）**：`engines.node`はダッシュボードの「Node.js Version」設定より優先される。
    メジャー版だけを指定する仕組みで、パッチ版（24.x.y）はVercelが自動で最新に上げる
    （[Vercel公式](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)）
  - **CI**：`.github/workflows/ci.yml`の`setup-node`が`node-version-file`で各`package.json`を読む
    （`check-latest: true`で、ランナーに入っている版ではなく最新のパッチ版を使う）
  - **ローカル**：範囲外のNodeで`npm install`すると`EBADENGINE`の警告が出る（警告だけで止まりはしない）。
    nvmを使う場合は`frontend/`・`backend/`の`.nvmrc`（`24`）で`nvm use`する
- メジャー版を上げるときは、両方の`package.json`（と`package-lock.json`の先頭の`engines`）・両方の`.nvmrc`・
  README.mdの「前提」を書き換える
- **Nodeのセキュリティリリースが出たとき**（[公式の脆弱性ブログ](https://nodejs.org/en/blog/vulnerability)）：
  1. Advisoryで、24.x の修正版の番号と、トレ部に関係する脆弱性があるかを確認する
     （例：2026-10-21の版は、Brotli展開の脆弱性がExpress 5のリクエストボディ展開に直接関係した）
  2. ローカルのNodeを修正版に上げる（`node -v`で確認）。CIは`check-latest: true`で毎回その時点の最新の24.xを取りに行くため、対応は不要
  3. 本番のパッチ版はVercelが自動で上げるが、いつ反映されたかは外からは分からない。そこで、
     Vercelのバックエンドのプロジェクトの「Logs」で`[runtime] Node.js v24.x.y`の行を探して確認する
     （`backend/api/index.ts`が関数の起動ごとに1回出す）。古い版のままなら、Deploymentsから
     最新の本番デプロイを「Redeploy」して、もう一度確認する
  4. フロントエンド（Nuxt）はリクエストボディを展開しないため影響は小さいことが多いが、同じ手順で
     再デプロイしておくと確実

## Dependabotのアラート・PRが来たとき

Issue #389（2026-10-24）で導入した。それまでは気づいたときに手で`npm audit`するしかなく、
本番依存の脆弱性（backend 10件・frontend 19件、#387で解消）が溜まっていた。

- **仕組み**：GitHubのDependabotが、依存パッケージ（`backend/`・`frontend/`のnpm、CIで使うGitHub Actions）を
  脆弱性データベースと照合し続ける。設定は[`.github/dependabot.yml`](../.github/dependabot.yml)
  - **アラート**：該当する脆弱性が見つかると、リポジトリの「Security」タブ → 「Dependabot」に一覧が出て、
    オーナーにGitHubの通知（メール等）が届く
  - **セキュリティ更新PR**：修正版があれば、Dependabotが`dependabot/...`ブランチからPRを自動で出す。
    ディレクトリごと（backend／frontend／Actions）に1つのPRへまとめる設定にしている
  - **通常のバージョン更新PRは出さない**（`open-pull-requests-limit: 0`）。脆弱性と関係のない更新PRが
    毎週来ると、セキュリティ更新PRが埋もれるため
  - PRは曜日に関係なく、脆弱性情報が公開され次第来る（`schedule`の「毎週月曜」はバージョン更新にだけ効く）
  - 前提として、リポジトリ設定（Settings → 左サイドバーの「Security and quality」→「Advanced Security」）の
    「Dependabot alerts」「Dependabot security updates」を有効にしてある（2026-10-24に有効化。
    上部タブの「Security and quality」はアラートの一覧で、設定画面ではない）。`dependabot.yml`の書き間違いは`main`にマージされてから検出されるため、
    設定を変えたときはマージ後に「Insights」→「Dependency graph」→「Dependabot」でエラーが出ていないか見る
- **PRが来たときの流れ**：
  1. PRに書かれたAdvisory（脆弱性の説明）で、**深刻度**と**どの依存が対象か**を確認する
  2. その依存が**本番で動くか**（`dependencies`か、本番のコードから使われるか）を判断する。
     `npm ls <パッケージ名>`（各ディレクトリで実行）で、どの依存経由で入っているかが分かる
  3. CIが通っていればマージする（マージはユーザーが行う）。CIはDependabotのPRでも通常どおり走る
     （`ci.yml`はsecretsを使っていないため、Dependabotの読み取り専用の権限でも動く）。
     CIが落ちる場合は、通常のIssue → ブランチ → PRの流れで手作業の更新に切り替える
  4. 本番に反映されるのは、ほかのPRと同じくマージ後のVercelのデプロイ時
- **Dependabotのは通常フローの例外**：Issue起票・ブランチ名の規則・`docs/spec.md`の更新は不要
  （依存の更新だけで仕様は変わらないため）。ただし、更新で挙動が変わって手直しが要る場合は、
  通常のフローで別のPRにする
- **見送る・dismissするときの判断基準**：
  - **開発時にしか動かない依存**（テスト・開発サーバー・ビルド時のツール。例：`vitest`、
    `nuxt dev`の開発サーバーが使う`listhen`→`node-forge`）は、本番の利用者に届かないため実害が低い。
    修正にメジャーアップデートやダウングレードが必要で手間がかかる場合は、見送ってよい
    - 見送るときは、アラートの画面で「Dismiss」→「Risk is tolerable to this project」（または
      「Vulnerable code is not actually used」）を選び、理由を一言書く。同時に
      [backlog.md](./backlog.md)「`npm audit fix`で解消できない脆弱性」に記録して、再検討のタイミングを残す
    - Dependabotが開いたPRは、閉じるとその版への更新は再提案されなくなる（より新しい修正版が出れば
      改めてPRが来る）
  - **本番で動く依存**は、深刻度が低くても見送らず対応する（`express`・`prisma`・`nuxt`本体など）
  - `dependabot.yml`の`ignore`では除外しない。`ignore`はその依存の**今後のセキュリティ更新も**
    止めてしまうため。個別のアラートを画面でdismissする方を使う
- **2026-10-24時点で来ると分かっているもの**：backlog.mdに記録済みの2件
  - ~~backend：`vitest`（`vitest@5`へのメジャー更新が要る）~~ → DependabotのPR #392がCIで落ちたため、
    [Issue #393](https://github.com/ConniConni/torebu/issues/393)の手作業のPRで`vitest@5`へ上げて解消済み（2026-10-27）
  - frontend：`nuxt`配下の`listhen`→`node-forge`。修正案が`nuxt`のダウングレードのため、
    PRが来ない／来ても採用しない。アラートはdismissしてよい

## 問題が起きたときの戻し方

マージした変更で本番に不具合が出たときは、次のどちらかで戻す。

1. **基本：取り消しのPRを出す**。GitHubのマージ済みPRの画面にある「Revert」ボタン（または
   `git revert`）で取り消しのブランチ・PRを作り、CIを通してマージする。履歴に「戻した」ことが残り、
   以降も通常の流れのまま進められる
2. **緊急時：Vercelで前のデプロイに戻す**（Instant Rollback）。VercelのダッシュボードのDeploymentsから、
   1つ前の本番デプロイを選んで戻す。CIを待たずに数秒で戻せる。ただし：
   - frontend・backendは別プロジェクトなので、**戻したい側それぞれで操作する**
   - 戻した後は、`main`に新しくマージしても**自動では本番に反映されなくなる**（Vercelが「意図的に戻した
     状態」を守るため）。原因を直すPRをマージしたら、プロジェクトのトップ画面の「Undo Rollback」で
     そのデプロイを本番に昇格させ、元の自動反映に戻す（[Vercel公式](https://vercel.com/docs/instant-rollback)）
   - 無料プラン（Hobby）では、戻せるのは直前の本番デプロイだけ

どちらの方法でも**DBのテーブル構造は戻らない**。マイグレーションを「古いコードでも動く形」で書く
ルール（上記「本番環境（Vercel）への反映について」）は、戻したときに壊れないようにするためでもある。
テーブル構造そのものを戻す必要があるときは、戻すためのマイグレーションを新しく作って出す。

## Issueの書き方

コピペしたくなる気持ちはわかるが、**Issueは「なぜ・何を」、PRは「どうやった・どう確認したか」**と役割を分けると、自然と内容が変わる。

```md
## 背景・目的
なぜこれが必要か（企画メモのどのフェーズ・セクションに対応するか）

## やること
- [ ] タスク1
- [ ] タスク2

## 完了条件
これが満たされたら完了、と言える状態
```

## プルリクの書き方

Issueをコピーしない。**「実装してみて実際どうだったか」を書く場所**、という意識で書く。

```md
## 概要
closes #番号

## 変更内容
実際に何をどう変えたか（Issueに書いていない実装の詳細・判断理由）

## 動作確認
どうやって動作を確認したか（手順、スクリーンショットがあれば添付）

## 気になる点・次にやること
このPRではやらなかったこと、レビューで見てほしい点
```

**書けなくて困ったら**：「Issueに書いた通りに実装した」だけでも、`## 動作確認`だけは必ず自分の言葉で書く。ここがIssueのコピーにならない一番のポイント。
