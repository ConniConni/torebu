// アプリ全体で共有する「今日」（YYYY-MM-DD）。以前は画面・部品ごとに setup 時に
// todayLocalDateString() を1回だけ呼んでいたため、タブを開いたまま日付をまたぐと
// 再マウントされた部品だけ新しい日付になり、カレンダーの選択日と今日の印が食い違った（Issue #310）。
// タブへの復帰と1分おきのタイマーで日付を見直し、変わっていれば更新する
const CHECK_INTERVAL_MS = 60_000

export function useToday() {
  const today = useState<string>('today', () => todayLocalDateString())

  const refresh = () => {
    const now = todayLocalDateString()
    if (now !== today.value) today.value = now
  }

  if (import.meta.client) {
    let timer: ReturnType<typeof setInterval> | undefined
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    onMounted(() => {
      // SSR時はサーバーのタイムゾーンで計算された値が引き継がれうるため、マウント直後にも補正する
      refresh()
      timer = setInterval(refresh, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', onVisible)
    })
    onBeforeUnmount(() => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    })
  }

  return today
}
