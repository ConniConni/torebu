// ②ホームの「今週のサマリー」表示。Phase3-D（docs/roadmap.md参照）。
//
// 新規バックエンドAPIは作らず、既存の`GET /stats/volume`（合計負荷重量）と
// `GET /workouts`から得られる記録日一覧（トレ日数）をフロントで週集計する
// （Phase3-Bの「今月/通算」記録日数と同じくフロント集計のみで完結させる方針、2026-09-08決定）。
//
// 週の定義は日曜始まり〜土曜（HomeCalendar.vueの曜日表示 日月火水木金土 と揃える）

function shiftDate(dateString: string, deltaDays: number): string {
  const date = new Date(`${dateString}T00:00:00`)
  date.setDate(date.getDate() + deltaDays)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

// todayを含む週（日曜〜土曜）の合計負荷重量(kg)を返す。
// pointsは`GET /stats/volume`のレスポンス（データが無い日は含まれない配列）を想定
export function sumWeeklyVolume(points: { date: string; volumeKg: number }[], today: string): number {
  const start = weekStartDate(today)
  const end = weekEndDate(today)
  return points
    .filter((p) => p.date >= start && p.date <= end)
    .reduce((sum, p) => sum + p.volumeKg, 0)
}

// todayを含む週（日曜〜土曜）のトレ日数を返す。
// recordedDatesは②で使っている`allRecordedDates`（hasSetsを問わない記録日の配列）を想定
export function countWeeklyTrainingDays(recordedDates: string[], today: string): number {
  const start = weekStartDate(today)
  const end = weekEndDate(today)
  return new Set(recordedDates.filter((d) => d >= start && d <= end)).size
}
