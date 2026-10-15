import { describe, expect, it } from 'vitest'
import {
  formatBestDate,
  formatBestGain,
  formatBestSet,
  formatBestWeight,
  splitVisibleBests,
  type PersonalBestRecord,
} from './personalBests'

function rec(weightKg: number, previousBestKg: number | null, reps = 5): PersonalBestRecord {
  return { date: '2026-10-12', weightKg, reps, previousBestKg }
}

describe('personalBests', () => {
  it('重量は小数1桁にそろえる', () => {
    expect(formatBestWeight(65)).toBe('65.0')
    expect(formatBestWeight(62.5)).toBe('62.5')
  })

  it('更新幅を出す。初めての記録は差分なし', () => {
    expect(formatBestGain(rec(65, 62.5))).toBe('+2.5kg')
    expect(formatBestGain(rec(65, 60))).toBe('+5.0kg')
    expect(formatBestGain(rec(55, null))).toBeNull()
  })

  it('セットは小数を必要なときだけ出す', () => {
    expect(formatBestSet(rec(65, 60, 5))).toBe('65kg×5')
    expect(formatBestSet(rec(62.5, 60, 8))).toBe('62.5kg×8')
  })

  it('日付は今年なら月/日、それ以外は年を付ける', () => {
    expect(formatBestDate('2026-10-12', 2026)).toBe('10/12')
    expect(formatBestDate('2025-09-08', 2026)).toBe('2025/9/8')
  })

  it('先頭4件までを出し、残りの件数を返す。開いたら全件', () => {
    const list = [1, 2, 3, 4, 5, 6, 7].map((n) => rec(50 + n, null))
    expect(splitVisibleBests(list, false)).toEqual({ visible: list.slice(0, 4), hiddenCount: 3 })
    expect(splitVisibleBests(list, true)).toEqual({ visible: list, hiddenCount: 0 })
    expect(splitVisibleBests(list.slice(0, 4), false).hiddenCount).toBe(0)
  })
})
