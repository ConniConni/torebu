// ②ホームの期間別サマリーカード（今週/今月/通算、Issue #169）で使う、今月/通算の合計負荷重量。
// trainingDays.ts（今月/通算のトレ日数）と対になる、今月/通算の合計負荷重量版。
//
// pointsは`GET /stats/volume?range=all`のレスポンス（データが無い日は含まれない配列）を想定。
// 今月/通算どちらも同じ全期間データから計算できるため、週別推移（weeklySummary.ts）と合わせて
// 1回の取得で済ませる（HomeScreen.vue参照）

// todayと同じ年月（YYYY-MM）の合計負荷重量(kg)
export function sumVolumeInMonth(points: { date: string; volumeKg: number }[], today: string): number {
  const monthPrefix = today.slice(0, 7)
  return points.filter((p) => p.date.startsWith(monthPrefix)).reduce((sum, p) => sum + p.volumeKg, 0)
}

// 通算の合計負荷重量(kg)
export function sumTotalVolume(points: { date: string; volumeKg: number }[]): number {
  return points.reduce((sum, p) => sum + p.volumeKg, 0)
}
