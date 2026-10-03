import { shiftDate } from './date'

// ②ホームの期間別サマリーカード（今週/今月/通算、Issue #169）で使う、今週/今月/通算の合計負荷重量。
// trainingDays.ts（今週/今月/通算のトレ日数）と対になる、合計負荷重量版。
//
// pointsは`GET /stats/volume?range=all`のレスポンス（データが無い日は含まれない配列）を想定。
// 今週/今月/通算どれも同じ全期間データから計算できるため、週別推移（weeklySummary.ts）と合わせて
// 1回の取得で済ませる（HomeScreen.vue参照）

// today起算でdays日前〜today（todayを含む）のローリング期間の合計負荷重量(kg)。
// 「今週」「今月」は暦週・暦月ではなく今日起算のローリング期間（直近7日／直近28日）にする方針
// （2026-09-11、ユーザー指摘：「今週」が実際には日曜起算であることが直感と合わない）。
// 週別推移カード（weeklySummary.ts）は「◯週前」ラベルとの整合のため暦週の定義のまま据え置き、
// このカードとは期間の定義がズレる点は許容した上での判断
export function sumRecentVolume(
  points: { date: string; volumeKg: number }[],
  today: string,
  days: number,
): number {
  const start = shiftDate(today, -(days - 1))
  return points
    .filter((p) => p.date >= start && p.date <= today)
    .reduce((sum, p) => sum + p.volumeKg, 0)
}

// 通算の合計負荷重量(kg)
export function sumTotalVolume(points: { date: string; volumeKg: number }[]): number {
  return points.reduce((sum, p) => sum + p.volumeKg, 0)
}

// セットの一覧から合計負荷重量(kg)を求める。Σ weightKg × reps で、自重セット(weightKgがnull)は
// 除外する（GET /stats/volumeと同じ定義）。③記録画面の日別サマリー（Issue #320）と
// 画像カードシェア（shareCard.ts）で使う
export function sumSetVolumeKg(sets: { weightKg: number | null; reps: number }[]): number {
  return sets.reduce((sum, s) => sum + (s.weightKg === null ? 0 : s.weightKg * s.reps), 0)
}

// 合計負荷重量をkg表記の文字列にする（3桁区切り。重量は0.5kg刻みのため、端数は小数第1位まで）。
// ホームの期間別サマリーはt表記（weightDisplay.tsのformatTons）だが、1日分は数千kg程度で、
// t表記だとセットを1つ足しても数字が変わらないことが多いためkg表記にした（Issue #320、ユーザー判断）
export function formatKg(kg: number): string {
  return `${kg.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}kg`
}
