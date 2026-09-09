// 通知一覧（Phase4、#144）用の簡易な相対時刻表示。分・時間・日の3段階のみ、
// それ以上前は日付（M/D）で表示する。秒単位の精度は不要なため切り捨てでよい
export function formatRelativeTime(isoString: string, now: Date = new Date()): string {
  const target = new Date(isoString)
  const diffMs = now.getTime() - target.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)

  if (diffMinutes < 1) return 'たった今'
  if (diffMinutes < 60) return `${diffMinutes}分前`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}時間前`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}日前`

  return `${target.getMonth() + 1}/${target.getDate()}`
}
