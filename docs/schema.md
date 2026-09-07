# DBスキーマ（ドラフト）

> フェーズごとに必要なテーブルを積み上げる形で設計。グループの公開範囲は「所属している間の記録は全員に見える」単純モデルとし、投稿単位の公開制御はあえて見送っている。
> 詳細な検討経緯は企画メモ（Artifact）のセクション04を参照。

## MVP

MVPの6テーブル（`users` / `exercises` / `workouts` / `workout_sets` / `routines` / `routine_exercises`）
の定義は[spec.md](./spec.md) §5「データモデル」を見る（正は[schema.prisma](../backend/prisma/schema.prisma)）。
このファイルには以降、Phase2以降のドラフトと設計方針メモだけを残す。

## Phase2（部位ハイライト可視化）

別プロジェクト（`筋トレ部位紐付け`）での先行検討が完了済み。詳細な経緯・確定事項は
[muscle-highlight.md](./muscle-highlight.md)（および元の検討ログ）を参照。要点：

- `react-native-body-highlighter`は**ライブラリとして利用しない**。SVGパス座標のみ静的コピーし、
  ゾーン塗り分け・FRONT/BACK間引き・ラベル衝突回避は自前のJS（DOM操作）をVueへ移植する
- **スコープは種目1件ごとの単発ハイライトのみ**（実績の累計から鍛えた部位が分かる機能は将来の拡張）。
  ④種目選択画面の各行に「ⓘ」ボタンを追加し、タップで全画面シートを開いて前面／背面を手動切り替えできる
  UIにする（詳細はmuscle-highlight.mdの「画面配置・UI仕様」参照）

```
exercises への追加カラム（既存の6テーブルの1つを拡張）

  main_muscle         text  null  -- 主働筋。muscle_groupより細かい粒度（例:「大胸筋上部」）
  related_muscles     text[] null -- 関連筋の配列（例:["上腕三頭筋","三角筋前部"]）
  main_zone           text  null  -- 意味は main_muscle によって変わる（対応表は下記・muscle-highlight.md参照）
```

- 3カラムとも既存の`muscle_detail`と同様nullableで追加し、マイグレーション不要な形にする
- **`main_zone`は`main_muscle`とセットで初めて意味が確定する**（同じ値でも部位によって指すものが違う）。
  実データの分布は以下の通り：
  - 胸（大胸筋）：`upper`/`mid`/`lower`＝ベンチ角度による起始の違い
  - 肩（三角筋）：`front`/`lateral`/`back`＝前部・側部・後部の区別
  - 背中：`lat`/`upper_back`＝広背筋か上背部かの区別
  - それ以外の`main_muscle`は`main_zone`が常にnull（77種目中46種目がnull）
  - 実装時は上記の対応関係を`muscle-highlight.md`に対応表として明記し、コード側のコメントにも残す
    （1つのtextカラムに複数の意味が混在する設計のため、ドキュメントを欠かすと次のセッションが誤読する）
- **移行元データセットの出典（`source_dataset`/`source_exercise_id`/`source_note`）は本番カラムにはしない**。
  アプリの実行時機能（ハイライト表示）はこれらを参照しないため、`master_exercises_v1.json`相当のファイルを
  seedのソースとしてリポジトリに残すだけにする（現行の[seed.ts](../backend/prisma/seed.ts)が種目データを
  コード内に直書きしているのと同じ位置づけ）
- **公式種目マスタ（`created_by IS NULL`）は総入れ替えする**：現行seed（[seed.ts](../backend/prisma/seed.ts)、
  約30種目・7分類のみ）を削除し、`master_exercises_v1.json`（77種目）を新seedの元データとする
  - `WorkoutSet.exercise`/`RoutineExercise.exercise`は`onDelete: Restrict`のため、旧`exercises`行を
    削除するには参照する`workouts`/`workout_sets`/`routines`/`routine_exercises`を先に全削除する必要がある。
    **既存のトレーニング記録は総入れ替えに伴い全削除する**（本番DBもこの時点ではユーザー自身のテスト記録のみ、
    2026-09-07ユーザー判断）
  - 実施時は`env -u GITHUB_TOKEN`のようなうっかりミスを避けるため、本番（Neon）に対する削除操作である旨を
    実行前に一言確認してから進める
- **カスタム種目（`created_by`が値あり）は色によるハイライト表示を行わない**（`muscle_group`の7分類だけで
  部位別に色分けしようとすると、例えば「脚」は内転筋群・ふくらはぎ・足・足首・前脛骨筋・大腿四頭筋・膝・
  ハムストリングの8スラッグ全部が対象になり範囲が広すぎて実用的でないため、2026-09-07にフォールバック
  表示自体を見送った）。代わりに「部位ハイライトのデータが無い種目」であることを示す表示（バッジ等）を
  検討する。UIの具体案はこのPhaseの着手時に決める

## Phase3（記録を可視化する）

個人の集計・前回記録の自動反映・週間サマリー・ストリーク。現時点でスキーマドラフトは未着手
（着手時に本ファイルへ追記する）。

> 筋肉イラスト可視化はここに含まれない。別プロジェクトでの先行検討が完了していたため、
> 2026-09-07にPhase2として独立させた（経緯は[muscle-highlight.md](./muscle-highlight.md)参照）。

## Phase4（交流・ランキング）

```
groups
  id                 uuid PK
  name               text
  created_by         uuid FK -> users        -- 作成者の記録用、権限とは別
  invite_code        text UNIQUE       -- 暗号学的乱数の英数字32文字程度
  invite_expires_at  timestamptz null    -- 再発行のたびに更新
  member_limit       int  default 10  -- 課金で拡張
  created_at         timestamptz
  updated_at         timestamptz
  deleted_at         timestamptz null  -- ソフトデリート。オーナーのみ実行可

group_members
  group_id      uuid FK -> groups
  user_id       uuid FK -> users
  role          enum(owner, member)     -- ownerは複数可
  joined_at     timestamptz
  left_at       timestamptz null        -- 退会してもソフトデリート
                 PK (group_id, user_id)

reactions                   -- いいね。汎用（workout/workout_set/topic_postに対応）
  id            uuid PK
  target_type   enum(workout, workout_set, topic_post)
  target_id     uuid            -- FK制約なし、アプリ側で検証
  user_id       uuid FK -> users
  created_at    timestamptz
                 UNIQUE (target_type, target_id, user_id)
                 INDEX (target_type, target_id)

comments                    -- 汎用（workout/topic_postに対応、workout_setは対象外）
  id            uuid PK
  target_type   enum(workout, topic_post)
  target_id     uuid            -- FK制約なし、アプリ側で検証
  user_id       uuid FK -> users
  body          text
  created_at    timestamptz
                 INDEX (target_type, target_id)

notifications
  id            uuid PK
  recipient_id  uuid FK -> users        -- 誰宛の通知か
  actor_id      uuid  null FK -> users  -- 誰が起こしたか（rankingのようなシステム通知はnull）
  type          enum(reaction, comment, topic, ranking, exercise_promoted)
  target_type   enum(workout, workout_set, topic_post, topic, exercise, group)
  target_id     uuid
  is_read       boolean default false
  created_at    timestamptz
                 INDEX (recipient_id, created_at)

topics                      -- イチオシこだわり共有のお題
  id            uuid PK
  group_id      uuid FK -> groups
  created_by    uuid FK -> users        -- オーナーが配信
  theme         enum(protein, gym, equipment, meal)
  question      text                     -- 例:「今使ってるプロテインは？」
  created_at    timestamptz

topic_posts                 -- 一言＋任意で写真の投稿
  id            uuid PK
  topic_id      uuid FK -> topics
  user_id       uuid FK -> users
  body          text
  image_url     text  null
  created_at    timestamptz
```

## Phase5（テーマ課金）

```
themes
  id            uuid PK
  name          text
  is_premium    boolean
  price_cents   int  null

user_theme_purchases
  user_id       uuid FK -> users
  theme_id      uuid FK -> themes
  purchased_at  timestamptz
                 PK (user_id, theme_id)
```

## 設計方針メモ

- **ランキング**は専用テーブルを持たず、`workout_sets`を集計するクエリ／マテリアライズドビューで算出する。個人の合計・推移集計（Phase3）を先に作り、その延長でグループ集計＝ランキングに拡張する
- **「イチオシこだわり共有」**は選択式アンケートではなく自由記述。写真投稿はストレージ費用が絡むためPhase5まで保留し、それまではテキストのみ
- **退会してもgroup_membersの行は物理削除しない**（`left_at`で論理管理）。過去に同じグループにいた事実が残るので、退会後も過去の記録・カスタム種目は仲間から見え続ける
- **オーナー権限は`group_members.role`で管理し複数人可**。唯一のownerは退会不可、ownerは他メンバーをownerに任命可能というルールはアプリ側のロジックで保証する
- **招待コードの「あと何人入れるか」は別カウンタを持たず**、参加時に「アクティブなgroup_members数（`left_at IS NULL`）< `member_limit`」を都度チェックして判定する。退会者が出れば自動的に枠が空く
- **種目マスタの削除機能は作らない**。表示・非表示の扱いはPhase2以降で検討する
- **部位分類は大分類（7分類）から開始**。`exercises.muscle_detail`をnullableで先に持たせ、後から細分化してもマイグレーション不要にする
- **カスタム種目**は`created_by`を持たせ、作成者と過去含めて同じグループにいたことがあるメンバーに見える。追加は専用画面（部位を選択式・種目名を自由記入）で行う
- **カスタム種目の公式マスタへの昇格**は`created_by`をNULLに書き換えるだけ。`exercise_id`は変わらないため過去記録の付け替えは不要
- **重複・表記ゆれ対策**：追加時に既存種目名との部分一致サジェストを表示。公式種目名の重複防止は当初「`UNIQUE (name) WHERE created_by IS NULL`」のDB部分UNIQUE制約を検討したが、Prismaのスキーマ言語では表現できずマイグレーションSQLの手動編集が必要になる上、公式種目の追加は当面1人（運営本人）が順番に行う運用のためレースコンディションが実質発生しない。制約維持のメンテコストに見合わないと判断し、MVPではDB制約を見送りアプリ側のサジェスト表示のみで対応する（運営操作が複数人・同時実行になるタイミングで再検討）
- **ランキング集計の対象は公式種目のみ**。カスタム種目は記録・ルーティンには使えるが、ランキング比較の対象からは外す
- **`reactions`/`comments`は`target_type`+`target_id`を持つ汎用テーブル**。workoutsは反応・コメント両方、workout_setsは反応のみ、topic_postsは反応・コメント両方
- **`workouts`の削除はソフトデリート**（`deleted_at`）。編集・削除しても`reactions`/`comments`は残る
- **`groups`の削除もソフトデリート**、実行はownerのみ。Phase4で実装
- **ソフトデリート/物理削除の使い分け基準**：削除後も他のレコードから参照され続ける（`reactions`/`comments`の対象になる、退会後も履歴として残す等）テーブルのみソフトデリートにし、参照する側が存在しないテーブルは物理削除でよい。全テーブル一律ソフトデリートにはしない（クエリに`deleted_at IS NULL`条件が常に必要になる、UNIQUE制約が複雑化する等のコストが見合わないため）。例：`routines`/`routine_exercises`は`reactions`/`comments`等の`target_type`一覧に含まれず参照されないため物理削除（Issue7）
- **認証はセッション方式**（JWTではなく）。退会・グループ削除・招待コード失効など「権限をすぐ失効させたい」場面が多いため
- **`weight_kg`はnullable**。自重種目（懸垂・腕立て伏せ等）に対応
- **`topic_posts`は1人1投稿の制約を設けない**。同じお題への連投を許可
- **`notifications`はreactions/commentsと同じ`target_type`+`target_id`の形に統一し、`actor_id`を直接持たせる**（GitHub・Slack等の通知機能で使われるオーソドックスな形）。配り方はFan-out on Write方式
- **`avatar_url`の画像アップロード実装はPhase5に回す**。MVP〜Phase4はイニシャルアイコン等で代替
- **編集され得るテーブルには`updated_at`を付与**。過去の変更履歴を全部残すバージョン管理は今の規模では不要と判断
- **退会後の同じグループへの再参加は可能**。実装は新規INSERTではなく、既存の`group_members`行をUPDATEして`left_at`をNULLに戻す形
- **筋肉イラスト可視化**は`react-native-body-highlighter`のSVG・筋肉スラッグデータを流用（Reactコンポーネント自体ではなくSVGデータのみ、ライセンスはMIT想定だが実装時に要確認）。出典はExRx.net中心＋free-exercise-db等で補完
- **有酸素運動は今回のmuscle_groupには含めない**。記録項目の設計とセットで将来の拡張機能として追加する
- **種目一覧の表示順**は「自分の使用回数 DESC → 名前順」の2段階。当初は`default_sort_order ASC`を
  間に挟む3段階で設計していたが、`default_sort_order`を全件null運用にしたため実装ではソート条件から
  省略している（詳細は[spec.md](./spec.md)の`GET /exercises`参照）
- **アカウント削除は完全削除せず匿名化する**。display_nameを「退会済みユーザー」に置き換え、投稿・コメント・いいねは残す
- **`birth_date`は登録時は任意のまま**。Phase3の「年代別分析・シェア」機能を使おうとしたタイミングで入力を促す
- **セッションストアはIssue4で自前実装から`connect-pg-simple`に変更**。当初`sessions`テーブルをPrismaで正規化（`user_id`/`expires_at`等）して設計したが、セッションの有効期限切れ判定・期限切れ行の定期削除を自前で実装するコストに対し、認証は枯れたライブラリに乗る方が実務的にも妥当と判断し変更。自前実装で得られたはずの「定期実行ジョブ」の学習は見送り、`docs/backlog.md`に別Issueの候補として積む

## セキュリティ実装の優先度

セッション認証自体がMVPの前提機能のため、ほとんどの項目はMVPのうちに土台として実装する。詳細（攻撃例・Express実装ヒント）は企画メモのセクション08「セキュリティ実装ガイド」を参照。

| 項目 | フェーズ |
|---|---|
| CSRF対策（SameSite Cookie等） | MVP |
| セッションCookieの属性設定（HttpOnly/Secure/SameSite） | MVP |
| 認可チェック（IDOR対策） | MVP（基本）→ Phase4で対象拡大 |
| ログイン試行のレート制限 | MVP |
| メールアドレス列挙対策 | MVP |
| XSS対策 | MVP（基本）→ Phase4で対象拡大 |
| セッション固定化対策 | MVP |

- **CSRF対策は`SameSite=Lax`のみで対応し、CSRFトークン等の追加実装はしない**。ただし`SameSite`はオリジン単位ではなく「サイト」（プロトコル＋登録可能ドメイン。ポート・サブドメインの違いは無視）単位で判定されるため、これが機能する前提として、**フロントエンド（Nuxt）とバックエンド（Express）を同一サイトに揃える**（ローカル開発はNuxtの開発サーバーのプロキシ機能でExpressへのリクエストを中継、本番も同一登録可能ドメイン配下に両方置く）という構成を取る。フロント・バックエンドが別ドメインにデプロイされる構成に変わる場合は、この前提が崩れるためCSRFトークン等の追加対策を再検討する
