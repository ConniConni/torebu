import { shiftDate } from './date'

// ②ホームの「今週○日／今月○日／通算○日」表示。Phase3-B（docs/roadmap.md参照）。
//
// 当初は連続記録日数（ストリーク）を表示する案で実装したが、「1年後にその数字が良いのか悪いのか
// 意味を持ちづらい」というユーザー指摘を受け、期間の区切りが分かりやすい「当月の記録日数」＋
// 積み上げが伝わる「通算の記録日数」の組み合わせに変更した（2026-09-08）。
//
// 「記録がある日」は`hasSets`を問わない（メモのみの日も含む。workouts.performed_atの存在だけで
// 判定する軽量な機能という前提に合わせる）

// today起算でdays日前〜today（todayを含む）のローリング期間の記録日数。
// 「今週」「今月」は暦週・暦月ではなく今日起算のローリング期間（直近7日／直近28日）にする方針
// （2026-09-11、trainingVolume.tsのsumRecentVolume参照）
export function countRecentTrainingDays(recordedDates: string[], today: string, days: number): number {
  const start = shiftDate(today, -(days - 1))
  return new Set(recordedDates.filter((d) => d >= start && d <= today)).size
}

export function countTotalTrainingDays(recordedDates: string[]): number {
  return new Set(recordedDates).size
}
