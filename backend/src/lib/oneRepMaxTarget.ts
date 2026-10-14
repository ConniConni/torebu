// 推定1RMの対象にする種目（複合関節種目、Issue #362）。DBに分類の列は持たず、公式種目名のリストで判定する
// （GET /exercisesが各種目に`isOneRmTarget`として返し、統計APIも同じ判定を使う）。
// リストに無い種目（単関節・自重・体幹・カスタム種目）は対象外。設定（users.showAllOneRm）がオンなら
// 対象外の種目にも参考値として出す。種目を足すときはここに名前を追加する
const ONE_RM_TARGET_EXERCISE_NAMES = new Set([
  'ベンチプレス',
  'インクラインベンチプレス',
  'デクラインベンチプレス',
  'クローズグリップベンチプレス',
  'ダンベルプレス',
  'インクラインダンベルプレス',
  'デッドリフト',
  'ベントオーバーロー',
  'ワンハンドローイング',
  'バーベルスクワット',
  'バーベルランジ',
  'ブルガリアンスクワット',
  'ステップアップ',
  'ヒップスラスト',
  'ダンベルショルダープレス',
  'アーノルドプレス',
  'チェストプレス',
  'レッグプレス',
  'スミスマシンスクワット',
  'スミスショルダープレス',
  'ケーブルショルダープレス',
])

// カスタム種目（createdByあり）は同名でも対象外（分類を確認できないため）
export function isOneRmTarget(exercise: { name: string; createdBy: string | null }): boolean {
  return exercise.createdBy === null && ONE_RM_TARGET_EXERCISE_NAMES.has(exercise.name)
}
