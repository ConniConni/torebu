// サーバー(Vercelのサーバーレス関数)はUTCで動くため、日本時間基準の日付判定が必要な処理
// (通算の節目・久しぶりの復帰の判定、Issue #255)向けに、日本時間(JST, UTC+9)の
// 「今日」を求める処理を切り出す

// 日本時間の「今日」をYYYY-MM-DD形式で返す。sv-SE(スウェーデン)ロケールの
// 標準的な日付表記がYYYY-MM-DD形式なため、フォーマット用に利用する
export function todayInJst(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
}

// YYYY-MM-DD形式の日付文字列にdays日を加減した日付文字列を返す(カレンダー日付の単純な計算。時刻は持たない)
export function shiftDateString(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
