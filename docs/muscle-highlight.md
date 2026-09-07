# 部位ハイライト可視化（Phase2）検討サマリー

> 2026-09-07、別プロジェクト（`/Users/koni/Desktop/ClaudeCode/筋トレ部位紐付け`）で先行検討していた
> 「トレーニングが体のどの部位に効くかを可視化する」機能をtorebuに移植する方針が確定した。
> **このファイルは要点サマリー。全経緯（比較・トレードオフ・後で覆った判断も含む）は元プロジェクトの
> `decision_log.md`（特に31〜42節）・`next_session_prompt.md`が正**。実装に着手する際は必ずそちらを通読する。
> 元プロジェクトはtorebuのリポジトリ外にあるため、Gitでは追跡されない点に注意（将来アクセスできなく
> なるリスクに備え、要点はこのファイルに残す）。

## 確定した実装方針

### ライブラリではなく自前実装で移植する

`react-native-body-highlighter`は**npmパッケージとしては利用しない**。元プロジェクトの
`muscle_highlight_proto.html`にある`DATA`オブジェクトは、同ライブラリのソースからSVGパス座標と
筋肉スラッグ名だけを静的にコピーしたもの。発光表現・ゾーン塗り分け・FRONT/BACK間引き・
ラベル配置（重なり回避）は全て自前のJS（素のDOM操作）で実装されている。

torebu（Vue）への移植は、この自前実装をベースに行う。プロトタイプのDOM操作
（`document.createElementNS`・`getBBox`等）はブラウザ標準APIなのでVue環境でもそのまま動く。
移植には「データ（SVGパス座標）」と「ロジック（ゾーン描画・間引き・ラベル衝突回避）」の**両方**が必要
（データだけ移植しても図は再現できない）。

- コピー元ライブラリのライセンス確認は未実施（実装時に必ず対応する。MIT想定）
- 座標データはコンポーネントに直書きせず、別ファイルのデータアセットに分離する

### 種目マスタのスキーマ：`docs/schema.md`旧Phase3案より本検討を優先

`docs/schema.md`が元々想定していたPhase3案（`highlight_muscles: [{slug, is_main}]`、ゾーン情報なし）は、
本検討（77種目分の実データ検証・技術的制約の洗い出し）より前に立てられた素案。

**方針**：`{slug, is_main}`のような単純形式に無理に合わせず、`main_zone`（ゾーンごとの描画ロジック）を
正式にスキーマ・実装へ組み込むことを前提に進める。ただし、実装コスト・既存スキーマへの影響範囲が
著しく大きい場合は押し通さず、折衷案（例：初期リリースでは`zone`を省略し主働筋/関連筋の区別のみ実装）
を検討してよい。

## 種目マスタデータ（`master_exercises_v1.json`、77種目）

現状のtorebu本体（[schema.prisma](../backend/prisma/schema.prisma)の`MuscleGroup` enum、7分類の大分類のみ）
より粒度が細かい。各種目は概ね以下の形：

```json
{
  "main_body_part": "胸",
  "name_ja": "ベンチプレス",
  "source": { "dataset": "hasaneyldrm/exercises-dataset", "exercise_id": "0025" },
  "main_muscle": "大胸筋",
  "related_muscles": ["上腕三頭筋", "三角筋前部"],
  "equipment": "バーベル",
  "main_zone": "mid"
}
```

- `main_body_part`（7分類、既存の`MuscleGroup`と対応）ごとの内訳：脚16・胸15・腕14・肩11・
  背中9・腹筋9・お尻3（合計77種目）
- `main_muscle`は`main_body_part`より細かい粒度（例：「大胸筋上部」「脊柱起立筋」等）
- `main_zone`は`upper`/`mid`/`lower`等、ベンチ角度などで起始が変わる場合の描画分岐に使う
  （後述の「内側」ゾーンは廃止済み）
- 元データに対応が無い種目は`source.exercise_id: null` + `note`で理由を明記して例外追加する
  （ルールの経緯はdecision_log.md 38節）

## 技術的制約（恒久的な仕様として残る）

SVGライブラリ（react-native-body-highlighter）由来のスラッグ構成に起因し、**自前実装に移行しても
座標データを引き継ぐ限り解消しない**：

- **`abductors`（外転筋群）非対応**：該当スラッグが無いため、外転筋群がメインの種目は「臀筋群」として
  表現するしかない（元プロジェクトではヒップアブダクションマシンを「お尻」カテゴリに分類する形で対処）
- **`lats`（広背筋）非対応**：`upper-back`スラッグに統合されているため、「広背筋」と「上背部」が
  図の上では区別できない（ラットプルダウン／チンニング／ベントオーバーロー等で発生）

## 途中で覆った判断（実装時に古い記述を参照しないよう注意）

- **「内側」（`inner`/`innerUpper`/`innerLower`）ゾーンは廃止済み**（decision_log.md 40節）。
  大胸筋は収縮時に常に水平内転方向へ働く1枚の筋肉で、「フライ＝内側の線維」という前提の解剖学的根拠が
  弱かったための訂正。フライ種目は全て`upper`/`mid`/`lower`に統一されており、結果として同じ角度の
  フライとプレスは表示上区別が無い
- ダーク／ライト両テーマ、男性／女性図の切り替えは、元プロジェクトのプロトタイプ
  （`muscle_highlight_proto.html`）で実装・動作確認済み

## スキーマ・データ移行方針（2026-09-07確定）

具体的なカラム定義は[schema.md](./schema.md)のPhase2セクション参照。要点：

- `exercises`に`main_muscle`/`related_muscles`/`main_zone`/`source_dataset`/`source_exercise_id`/
  `source_note`をnullableカラムとして追加する（関連テーブルへの分離はしない）
- **既存の公式種目seed（約30種目・7分類）は削除し、`master_exercises_v1.json`（77種目）に総入れ替え**。
  `WorkoutSet`/`RoutineExercise`が旧`exercises`行を`onDelete: Restrict`で参照しているため、
  **既存のトレーニング記録（workouts/workout_sets/routines/routine_exercises）も全削除**が前提になる
  （ユーザー判断、本番DBの現状データはユーザー自身のテスト記録のみのため許容）
- **カスタム種目**（`main_muscle`等のデータを持たない）は、可視化時に`muscle_group`（7分類）に対応する
  体の範囲をゾーン・発光なしで塗るフォールバック表示にする

## 未着手・次に決めること

- ライブラリ由来SVGデータのライセンス確認（実装時に対応する）
- Vue側のコンポーネント構成・データアセットの配置（`muscle_highlight_proto.html`からの移植方法）は
  このPhaseの着手時に設計する
