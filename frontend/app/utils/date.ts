// ローカル（ブラウザのタイムゾーン。基本JSTを想定）の暦日をYYYY-MM-DD形式で返す。
// Date#toISOString()はUTC基準になるため、深夜0:00〜8:59台（JST）に「今日」の日付が
// 前日にズレるバグを起こしやすい。それを避けるため、必ずローカルのgetter経由で組み立てる
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayLocalDateString(): string {
  return toLocalDateString(new Date())
}

// ③記録作成（/workouts/new）の?date=クエリを解決する。
// 形式が不正・実在しない暦日（2026-02-30等）・未来日のいずれかであれば今日にフォールバックする。
// 未来日を弾くのはフロント側のガードのみ（バックエンドAPI側のバリデーションは今回のスコープ外。
// docs/backlog.md参照）
export function resolveTargetDate(queryDate: unknown, today: string): string {
  if (typeof queryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(queryDate)) return today
  const parsed = new Date(`${queryDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime()) || toLocalDateString(parsed) !== queryDate) return today
  if (queryDate > today) return today
  return queryDate
}
