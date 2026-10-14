// ③記録作成画面のセット行に出す推定1RM（「RM」列、Issue #360・#362）。
// 計算式・回数帯の境界は統計（backend/src/lib/oneRepMax.ts）と同じ：オコナー式 `重量 × (1 + 0.025 × 回数)`、
// 1回は重量そのまま。回数帯は 1〜10回＝通常 ／ 11〜14回＝参考値（グレー）／ 15回以上＝出さない。
// 式や境界を変えるときは両方そろえる

const MAX_REPS_NORMAL = 10
const MAX_REPS_REFERENCE = 14

export type OneRepMaxLevel = 'normal' | 'reference'

export interface OneRepMaxCell {
  valueKg: number // 0.1kg単位
  level: OneRepMaxLevel
}

export function oneRepMaxLevel(reps: number | null): OneRepMaxLevel | null {
  if (reps === null || reps < 1 || reps > MAX_REPS_REFERENCE) return null
  return reps <= MAX_REPS_NORMAL ? 'normal' : 'reference'
}

// 自重（重量なし）・対象外の回数（0・未入力・15回以上）ならnull。
// `重量 × (40 + 回数) / 40` で計算するのは、半端な重量（65kg×6回など）で小数の誤差が出ないようにするため
export function estimateOneRepMaxKg(weightKg: number | null, reps: number | null): number | null {
  if (weightKg === null || oneRepMaxLevel(reps) === null) return null
  const value = reps === 1 ? weightKg : (weightKg * (40 + reps!)) / 40
  return Math.round(value * 10) / 10
}

// セット行に出す値。対象外の種目（単関節・自重など）を設定で表示しているときは、回数に関わらず
// 全て参考値（グレー）にする
export function oneRepMaxCell(
  weightKg: number | null,
  reps: number | null,
  isTarget: boolean,
): OneRepMaxCell | null {
  const valueKg = estimateOneRepMaxKg(weightKg, reps)
  if (valueKg === null) return null
  return { valueKg, level: isTarget ? oneRepMaxLevel(reps)! : 'reference' }
}

// カード内で強調する値（通常の回数帯の最大）。通常の値が2つ未満なら、比べる相手がいないためnull。
// 参考値（グレー）は最大でも強調しない
export function topNormalEstimate(cells: (OneRepMaxCell | null)[]): number | null {
  const values = cells.filter((c) => c !== null && c.level === 'normal').map((c) => c!.valueKg)
  return values.length >= 2 ? Math.max(...values) : null
}

// 表の下の注意書き（種目カード単位）。RM列を出さない（対象外の種目で設定オフ）ときの文言も含む
export const ONE_RM_NOT_TARGET_NOTE = '単関節・自重種目は1RMの対象外です。'

export function oneRepMaxNotes(
  sets: { weightKg: number | null; reps: number | null }[],
  isTarget: boolean,
): string[] {
  const notes = ['RM＝推定1RM（オコナー式）']
  if (!isTarget) {
    notes.push('この種目は1RMの対象外のため、値は参考値です（設定で表示中）')
  } else if (sets.some((s) => s.weightKg !== null && oneRepMaxLevel(s.reps) === 'reference')) {
    notes.push('グレーの値は11〜14回のセットの参考値です')
  }
  if (sets.some((s) => s.weightKg !== null && s.reps !== null && s.reps > MAX_REPS_REFERENCE)) {
    // 「RM＝…」の説明は、「表示しません」の説明と並べずに外す（1行にまとめる）
    notes.shift()
    notes.push('15回以上のセットは誤差が大きいため1RMを表示しません。')
  }
  return notes
}
