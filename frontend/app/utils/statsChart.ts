// 統計画面（/stats、Phase3-C）用の、APIレスポンス→Chart.js dataset形式への変換ロジック。
// バックエンドは`GET /stats/volume`・`GET /stats/exercises/:id/history`のどちらも
// `{date, ...}[]`（日付昇順、データが無い日は0埋めしない）で返す（docs/spec.md参照）。
// グラフ描画コード（vue-chartjs）から使う純粋関数として切り出し、ここだけVitestでテストする
// （CLAUDE.mdの優先順位に沿い、コンポーネント自体の単体テストは見送る）

export interface DatedValue {
  date: string // YYYY-MM-DD
  value: number
}

export interface LineChartData {
  labels: string[]
  datasets: [{ label: string; data: number[] }]
}

// 日付ラベルは軸が横に長くなりがちなため年を省いた"M/D"表記にする
// （全期間表示`range=all`で年をまたいでも、隣接ラベルとの日付の前後関係が分かれば十分なため）
export function formatDateLabel(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function toLineChartData(points: DatedValue[], label: string): LineChartData {
  return {
    labels: points.map((p) => formatDateLabel(p.date)),
    datasets: [{ label, data: points.map((p) => p.value) }],
  }
}
