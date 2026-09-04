// 種目名の表記ゆれ（スペース・中点・大文字小文字）を吸収するための正規化。
// 「ベンチプレス」と「ベンチ・プレス」のような表記ゆれを同一とみなして比較するために使う
export function normalizeExerciseName(name: string): string {
  // \sはUnicodeの空白文字(全角スペースを含む)を包含するため、中点だけ別途指定すればよい
  return name.replace(/[\s・･]/g, '').toLowerCase()
}
