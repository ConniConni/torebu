// ③記録作成で、⑤ルーティン適用によって積まれた「入力待ちの種目」を保持するための状態。
// ④種目選択・⑦種目追加への遷移を挟んでも消えてはいけないため、ページ専用のrefではなく
// usePickedExerciseIdと同様にuseStateに置く（横断ルール：spec.md §3-3）
export type PendingExercise = { exerciseId: string; name: string }

export function usePendingExercises() {
  return useState<PendingExercise[]>('pending-exercises', () => [])
}
