// ④種目選択・⑦種目追加で選んだ種目を、遷移元(③記録作成・⑤ルーティン編集など。④⑦のreturnTo
// クエリパラメータで指定される)へ戻ったときに受け渡すための一時的な状態。
// クエリパラメータではなくuseStateにしているのは、遷移元側で「選択済みかどうか」を消費したら
// 都度クリアしたい(戻る操作で再度セット入力/種目追加が開いてしまうのを防ぐ)ため
export function usePickedExerciseId() {
  return useState<string | null>('picked-exercise-id', () => null)
}
