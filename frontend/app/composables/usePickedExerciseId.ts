// ④種目選択・⑦種目追加で選んだ種目を、③記録作成へ戻ったときに受け渡すための一時的な状態。
// クエリパラメータではなくuseStateにしているのは、③側で「選択済みかどうか」を消費したら
// 都度クリアしたい(戻る操作で再度セット入力が開いてしまうのを防ぐ)ため
export function usePickedExerciseId() {
  return useState<string | null>('picked-exercise-id', () => null)
}
