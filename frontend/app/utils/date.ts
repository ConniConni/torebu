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
