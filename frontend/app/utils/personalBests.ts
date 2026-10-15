// 統計画面の自己ベスト履歴（Issue #370、`GET /stats/exercises/:id/personal-bests`）の表示用の整形・折りたたみ。
// 漸進性過負荷の見える化の④「伸びの記録の拡張」の2つ目。モックは`docs/mock/growth-record.html`

// 折りたたまずに出す件数（新しい順の先頭）
export const PERSONAL_BEST_VISIBLE = 4

export interface PersonalBestRecord {
  date: string
  weightKg: number
  reps: number
  // 更新前のベスト。初めての記録はnull
  previousBestKg: number | null
}

// 重量は0.5kg単位のため小数1桁にそろえる（65→65.0）。名前は他のutilsの自動インポートと衝突させない
export function formatBestWeight(kg: number): string {
  return kg.toFixed(1)
}

// 更新幅（「+2.5kg」）。初めての記録は差分なし（null）
export function formatBestGain(record: PersonalBestRecord): string | null {
  if (record.previousBestKg === null) return null
  return `+${(record.weightKg - record.previousBestKg).toFixed(1)}kg`
}

// そのときのセット（「65kg×5」。小数は必要なときだけ）
export function formatBestSet(record: PersonalBestRecord): string {
  return `${Number(record.weightKg.toString())}kg×${record.reps}`
}

// YYYY-MM-DD → 「10/12」。全期間のため、今年以外は「2025/10/12」と年を付ける
export function formatBestDate(date: string, currentYear: number): string {
  const [y, m, d] = date.split('-')
  const md = `${Number(m)}/${Number(d)}`
  return Number(y) === currentYear ? md : `${y}/${md}`
}

export function splitVisibleBests(
  records: PersonalBestRecord[],
  expanded: boolean,
  limit = PERSONAL_BEST_VISIBLE,
): { visible: PersonalBestRecord[]; hiddenCount: number } {
  if (expanded || records.length <= limit) return { visible: records, hiddenCount: 0 }
  return { visible: records.slice(0, limit), hiddenCount: records.length - limit }
}
