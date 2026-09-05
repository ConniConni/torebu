# ロードマップ（Issueバックログ）

> MVPで着手予定のIssueをタイトルだけ並べた見通し用のメモ。詳細（背景・やること・完了条件・見積もり）は
> 着手直前に`.github/ISSUE_TEMPLATE/task.md`のフォーマットで都度作成する（`docs/git-workflow.md`参照）。
> 実装しながら順番・中身が変わる前提のリストなので、進めながら随時更新する。

## MVP

- [x] Issue1: Nuxtプロジェクトの初期セットアップ
- [x] Issue2: バックエンド（Express）の初期セットアップ
- [x] Issue3: DBスキーマの実装（Prismaモデル定義・マイグレーション）
      `users` / `sessions` / `exercises` / `workouts` / `workout_sets` / `routines` / `routine_exercises`
- [x] Issue4: ユーザー登録・ログイン（セッション認証）API　→ 画面①
- [x] Issue5: 種目マスタAPI（一覧取得・カスタム種目追加）　→ 画面④⑦
- [x] Issue6: トレーニング記録（workout/workout_sets）CRUD API　→ 画面③⑥
- [x] Issue7: ルーティンCRUD API　→ 画面⑤
- [x] Issue8: フロント：ログイン／新規登録画面（①）
- [x] Issue9: フロント：ホーム画面（②、カレンダー表示）
- [x] Issue10: フロント：記録作成・種目選択・種目追加（③④⑦）
- [x] Issue11: フロント：ルーティン一覧・編集（⑤）
- [x] Issue12: フロント：記録詳細（⑥）
- [x] Issue13(仮): フロント：③記録作成にルーティン適用機能を追加
      ③から⑤の登録済みルーティンを選び、種目一式を一括で展開する（`docs/spec.md`の記録フロー図参照）。
      Issue11では⑤単体のCRUD（一覧・作成・編集・種目の追加削除並び替え）のみ実装し、この統合部分は
      スコープ外として切り出した

## 次のIssue候補

- 未対応事項・改善アイデアは `docs/backlog.md` にまとめてある。次のIssueを選ぶときはそちらを見る
- ~~**③セット入力UIを自動保存方式に統一する**~~：[Issue #89](https://github.com/ConniConni/torebu/issues/89)
  で方針決定、[Issue #91](https://github.com/ConniConni/torebu/issues/91)で実装対応済み（2026-09-05）。
  詳細は[backlog.md](./backlog.md)「解決済み・決定済み」参照
- **③記録作成・⑥記録詳細の統合**（2026-09-04検討）：②ホームのカレンダー日付選択→③記録作成画面へ
  遷移という設計（[backlog.md](./backlog.md)「未決定事項」参照）を進める過程で、③（セット追加はできるが
  値編集・記録削除ができない）と⑥（逆にセット追加ができない）の非対称に気づき、「その日の記録」画面として
  1つに統合する方針にした。安全に進めるため以下の順で分割する（[Issue #52](https://github.com/ConniConni/torebu/issues/52)が1番目）
  - [x] 1. ③記録作成画面を任意の日付に対応させる（[Issue #52](https://github.com/ConniConni/torebu/issues/52)）
  - [x] 2. ③にセット値編集機能を追加する（⑥の`onStartEditSet`/`onSaveSet`相当を移植、
        [Issue #54](https://github.com/ConniConni/torebu/issues/54) / [PR #55](https://github.com/ConniConni/torebu/pull/55)）
  - [x] 3. ③に記録（workout）削除機能を追加する（⑥の2段階確認の削除UIを移植）。あわせて
        「中断してホームへ」ボタンの文言も「ホームへ戻る」に変更（[Issue #56](https://github.com/ConniConni/torebu/issues/56)）
  - [x] 4. ⑥記録詳細ページを廃止し、②ホームの記録カードのリンク先を③（日付付き）に切り替える。
        1〜3が揃って初めて安全に切れる（[Issue #58](https://github.com/ConniConni/torebu/issues/58) /
        [PR #59](https://github.com/ConniConni/torebu/pull/59)）
  - **③⑥統合はこれで完了**。気づいたUI改善アイデア・要調査のバグは`docs/backlog.md`に追記済み
  - なお②のカレンダー日付選択自体の挙動（クリックで下に一覧表示）は変更しない方針で確定
    （ユーザー判断、2026-09-04）
- ~~**⑤ルーティン編集の保存UIを自動保存に統一する**~~ → [Issue #72](https://github.com/ConniConni/torebu/issues/72)
  で対応済み（2026-09-04）。名前欄の「保存」ボタンを廃止し、blur時自動保存に変更した
- ~~**⑤ルーティンに目安のセット（重量・回数）を持たせ、適用時に即登録できるようにする**~~（2026-09-04
  再検討、詳細は`docs/backlog.md`参照）。規模が大きいため2 Issueに分けて進めた
  - [x] スキーマ＋API＋⑤編集UI（[Issue #74](https://github.com/ConniConni/torebu/issues/74)、2026-09-05対応済み）
  - [x] ③適用フローを「即登録＋手直し」方式に作り直す（[Issue #76](https://github.com/ConniConni/torebu/issues/76) /
        [PR #77](https://github.com/ConniConni/torebu/pull/77)、2026-09-05対応済み）

## 並び順の考え方

- DBスキーマ（Issue3）を最初に固めないと、以降のAPI実装が土台なしで進められない
- 認証（Issue4）は他の全APIの前提（誰の記録かを扱うため）になるので次点
- API（Issue4〜7）を先に一通り作ってからフロント（Issue8〜12）、という区切りにしているが、
  実際に進めながら「先に手を動かして確かめたい画面があるので順番を入れ替える」等は普通にあり得る
- Phase2以降（グループ・ランキング・通知・イチオシこだわり共有）はMVPが動いてから着手するため、
  ここにはまだ含めていない

## 使い方

- 新しいセッションで「次はIssue Xをお願い」と言えば、このリストのIssue Xの下書きから着手する
- Issueが完了したらチェックを付ける
- 進めながら気づいた順番の変更・追加・削除は、都度このファイルを更新する（`docs/learning-log.md`の
  「次回やること」と役割が重なる部分はこちらに集約してよい）
