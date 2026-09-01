# DBスキーマ（ドラフト）

> フェーズごとに必要なテーブルを積み上げる形で設計。グループの公開範囲は「所属している間の記録は全員に見える」単純モデルとし、投稿単位の公開制御はあえて見送っている。
> 詳細な検討経緯は企画メモ（Artifact）のセクション04を参照。

## MVP

```
users
  id                        uuid PK
  email                     text UNIQUE
  password_hash             text            -- bcryptでハッシュ化
  display_name              text
  avatar_url                text  null
  birth_date                date  null
  gender                    enum  null      -- male/female/other/no_answer
  occupation                text  null
  password_reset_token      text  null
  password_reset_expires_at timestamptz null
  created_at                timestamptz
  updated_at                timestamptz

sessions                    -- 認証はセッション方式。退会・権限変更を即失効させやすいため
  id             uuid PK
  user_id        uuid FK -> users
  expires_at     timestamptz
  created_at     timestamptz

exercises                   -- 種目マスタ
  id                 uuid PK
  name               text
  muscle_group       enum            -- 胸/背中/脚/肩/腕/お尻/腹筋
  muscle_detail      text  null      -- 将来の細分類用
  equipment          text  null
  created_by         uuid  null FK -> users  -- null=公式、値ありならカスタム種目（作成者と同グループの人に見える）
  default_sort_order int null       -- 運営が定番種目に設定。使用履歴が無い時のフォールバック順
  updated_at         timestamptz
                      -- 公式種目名の重複防止は、DB制約ではなくアプリ側の重複サジェスト表示のみで運用（詳細は下記メモ）

workouts                    -- 1回のセッション
  id            uuid PK
  user_id       uuid FK -> users
  performed_at  date
  memo          text  null
  created_at    timestamptz
  updated_at    timestamptz
  deleted_at    timestamptz null  -- ソフトデリート。reactions/commentsを残すため

workout_sets
  id            uuid PK
  workout_id    uuid FK -> workouts
  exercise_id   uuid FK -> exercises
  set_order     int
  weight_kg     numeric null    -- 自重種目はnull
  reps          int
  created_at    timestamptz
  updated_at    timestamptz

routines                    -- 「胸の日」等のテンプレート
  id            uuid PK
  user_id       uuid FK -> users
  name          text
  created_at    timestamptz
  updated_at    timestamptz

routine_exercises
  id            uuid PK
  routine_id    uuid FK -> routines
  exercise_id   uuid FK -> exercises
  sort_order    int
```

## Phase2（交流・ランキング）

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

## Phase3（可視化）

```
exercises への追加カラム   -- 筋肉イラスト可視化、3段階で拡張

  -- Stage1: 追加カラムなし。muscle_group(7分類)→ライブラリのスラッグは
  --         アプリコード内の対応表で解決し、該当部分だけ塗る（濃淡なし・出典不要）

  highlight_slugs   jsonb null  -- Stage2: 効く部位のスラッグ配列。例 ["chest","triceps"]（濃淡なし）

  highlight_muscles jsonb null  -- Stage3: [{slug, is_main}] 主働筋/協働筋の区別つき
                                 -- highlight_slugsを置き換え。濃淡表示＋部位検索(is_main=trueのみ対象)に使う
```

## Phase4（テーマ課金）

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
- **「イチオシこだわり共有」**は選択式アンケートではなく自由記述。写真投稿はストレージ費用が絡むためPhase4まで保留し、それまではテキストのみ
- **退会してもgroup_membersの行は物理削除しない**（`left_at`で論理管理）。過去に同じグループにいた事実が残るので、退会後も過去の記録・カスタム種目は仲間から見え続ける
- **オーナー権限は`group_members.role`で管理し複数人可**。唯一のownerは退会不可、ownerは他メンバーをownerに任命可能というルールはアプリ側のロジックで保証する
- **招待コードの「あと何人入れるか」は別カウンタを持たず**、参加時に「アクティブなgroup_members数（`left_at IS NULL`）< `member_limit`」を都度チェックして判定する。退会者が出れば自動的に枠が空く
- **種目マスタの削除機能は作らない**。表示・非表示の扱いはPhase3以降で検討する
- **部位分類は大分類（7分類）から開始**。`exercises.muscle_detail`をnullableで先に持たせ、後から細分化してもマイグレーション不要にする
- **カスタム種目**は`created_by`を持たせ、作成者と過去含めて同じグループにいたことがあるメンバーに見える。追加は専用画面（部位を選択式・種目名を自由記入）で行う
- **カスタム種目の公式マスタへの昇格**は`created_by`をNULLに書き換えるだけ。`exercise_id`は変わらないため過去記録の付け替えは不要
- **重複・表記ゆれ対策**：追加時に既存種目名との部分一致サジェストを表示。公式種目名の重複防止は当初「`UNIQUE (name) WHERE created_by IS NULL`」のDB部分UNIQUE制約を検討したが、Prismaのスキーマ言語では表現できずマイグレーションSQLの手動編集が必要になる上、公式種目の追加は当面1人（運営本人）が順番に行う運用のためレースコンディションが実質発生しない。制約維持のメンテコストに見合わないと判断し、MVPではDB制約を見送りアプリ側のサジェスト表示のみで対応する（運営操作が複数人・同時実行になるタイミングで再検討）
- **ランキング集計の対象は公式種目のみ**。カスタム種目は記録・ルーティンには使えるが、ランキング比較の対象からは外す
- **`reactions`/`comments`は`target_type`+`target_id`を持つ汎用テーブル**。workoutsは反応・コメント両方、workout_setsは反応のみ、topic_postsは反応・コメント両方
- **`workouts`の削除はソフトデリート**（`deleted_at`）。編集・削除しても`reactions`/`comments`は残る
- **`groups`の削除もソフトデリート**、実行はownerのみ。Phase2で実装
- **認証はセッション方式**（JWTではなく）。退会・グループ削除・招待コード失効など「権限をすぐ失効させたい」場面が多いため
- **`weight_kg`はnullable**。自重種目（懸垂・腕立て伏せ等）に対応
- **`topic_posts`は1人1投稿の制約を設けない**。同じお題への連投を許可
- **`notifications`はreactions/commentsと同じ`target_type`+`target_id`の形に統一し、`actor_id`を直接持たせる**（GitHub・Slack等の通知機能で使われるオーソドックスな形）。配り方はFan-out on Write方式
- **`avatar_url`の画像アップロード実装はPhase4に回す**。MVP〜Phase3はイニシャルアイコン等で代替
- **編集され得るテーブルには`updated_at`を付与**。過去の変更履歴を全部残すバージョン管理は今の規模では不要と判断
- **退会後の同じグループへの再参加は可能**。実装は新規INSERTではなく、既存の`group_members`行をUPDATEして`left_at`をNULLに戻す形
- **筋肉イラスト可視化**は`react-native-body-highlighter`のSVG・筋肉スラッグデータを流用（Reactコンポーネント自体ではなくSVGデータのみ、ライセンスはMIT想定だが実装時に要確認）。出典はExRx.net中心＋free-exercise-db等で補完
- **有酸素運動は今回のmuscle_groupには含めない**。記録項目の設計とセットで将来の拡張機能として追加する
- **種目一覧の表示順**は「自分の使用回数 DESC → default_sort_order ASC → 名前順」
- **アカウント削除は完全削除せず匿名化する**。display_nameを「退会済みユーザー」に置き換え、投稿・コメント・いいねは残す
- **`birth_date`は登録時は任意のまま**。Phase3の「年代別分析・シェア」機能を使おうとしたタイミングで入力を促す

## セキュリティ実装の優先度

セッション認証自体がMVPの前提機能のため、ほとんどの項目はMVPのうちに土台として実装する。詳細（攻撃例・Express実装ヒント）は企画メモのセクション08「セキュリティ実装ガイド」を参照。

| 項目 | フェーズ |
|---|---|
| CSRF対策（SameSite Cookie等） | MVP |
| セッションCookieの属性設定（HttpOnly/Secure/SameSite） | MVP |
| 認可チェック（IDOR対策） | MVP（基本）→ Phase2で対象拡大 |
| ログイン試行のレート制限 | MVP |
| メールアドレス列挙対策 | MVP |
| XSS対策 | MVP（基本）→ Phase2で対象拡大 |
| セッション固定化対策 | MVP |
