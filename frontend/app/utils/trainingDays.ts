// ②ホームの「今月○日／通算○日」表示。Phase3-B（docs/roadmap.md参照）。
//
// 当初は連続記録日数（ストリーク）を表示する案で実装したが、「1年後にその数字が良いのか悪いのか
// 意味を持ちづらい」というユーザー指摘を受け、期間の区切りが分かりやすい「当月の記録日数」＋
// 積み上げが伝わる「通算の記録日数」の組み合わせに変更した（2026-09-08）。
//
// 「記録がある日」は`hasSets`を問わない（メモのみの日も含む。workouts.performed_atの存在だけで
// 判定する軽量な機能という前提に合わせる）

export function countTotalTrainingDays(recordedDates: string[]): number {
  return new Set(recordedDates).size
}

// todayと同じ年月（YYYY-MM）の記録日数
export function countTrainingDaysInMonth(recordedDates: string[], today: string): number {
  const monthPrefix = today.slice(0, 7)
  return new Set(recordedDates.filter((d) => d.startsWith(monthPrefix))).size
}
