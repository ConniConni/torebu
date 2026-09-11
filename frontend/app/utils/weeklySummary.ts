import { shiftDate } from './date'

// ②ホームの「今週のサマリー」表示。Phase3-D（docs/roadmap.md参照）。
//
// 新規バックエンドAPIは作らず、既存の`GET /stats/volume`（合計負荷重量）と
// `GET /workouts`から得られる記録日一覧（トレ日数）をフロントで週集計する
// （Phase3-Bの「今月/通算」記録日数と同じくフロント集計のみで完結させる方針、2026-09-08決定）。
//
// 週の定義は日曜始まり〜土曜（HomeCalendar.vueの曜日表示 日月火水木金土 と揃える）。
// 期間別サマリーカードの「今週」は今日起算のローリング7日間に変更したため（2026-09-11、
// trainingDays.ts/trainingVolume.tsのcountRecentTrainingDays/sumRecentVolume参照）、
// この暦週の定義を使っているのは週別推移カード（このファイルのweeklyVolumeTrend）のみになった

// todayを含む週の開始日（直近の日曜日）をYYYY-MM-DD形式で返す
export function weekStartDate(today: string): string {
  const dayOfWeek = new Date(`${today}T00:00:00`).getDay()
  return shiftDate(today, -dayOfWeek)
}

// todayを含む週の終了日（直近の土曜日）をYYYY-MM-DD形式で返す。
// 週の範囲判定はtodayではなくこちらを上限にする（todayで打ち切ると、サーバー・クライアントの
// 時計ズレ等で「今週の土曜日だがtodayより後」のデータが誤って対象外になりうるため）
export function weekEndDate(today: string): string {
  return shiftDate(weekStartDate(today), 6)
}

export interface WeeklyVolumeTrendPoint {
  weekStart: string
  label: string // 今週／1週前／2週前…
  volumeKg: number
}

// todayを含む週を最新として、直近weeks週分の合計負荷重量を古い週→新しい週の順で返す
// （表示側で「今週を上に」等の並び替えをしやすいよう、常に時系列順で返す）
export function weeklyVolumeTrend(
  points: { date: string; volumeKg: number }[],
  today: string,
  weeks = 4,
): WeeklyVolumeTrendPoint[] {
  const currentWeekStart = weekStartDate(today)
  const result: WeeklyVolumeTrendPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = shiftDate(currentWeekStart, -7 * i)
    const end = shiftDate(start, 6)
    const volumeKg = points
      .filter((p) => p.date >= start && p.date <= end)
      .reduce((sum, p) => sum + p.volumeKg, 0)
    result.push({ weekStart: start, label: i === 0 ? '今週' : `${i}週前`, volumeKg })
  }
  return result
}
