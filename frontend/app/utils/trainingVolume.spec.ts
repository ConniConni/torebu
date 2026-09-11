import { describe, expect, it } from 'vitest'
import { sumRecentVolume, sumTotalVolume } from './trainingVolume'

describe('sumRecentVolume', () => {
  const today = '2026-09-08'

  it('today起算でdays日前〜todayの範囲のみ合計する（直近7日の例）', () => {
    const points = [
      { date: '2026-09-01', volumeKg: 999 }, // 8日前: 対象外
      { date: '2026-09-02', volumeKg: 1000 }, // 7日前（範囲の開始日）: 対象
      { date: '2026-09-08', volumeKg: 500 }, // 今日: 対象
      { date: '2026-09-09', volumeKg: 999 }, // 未来日: 対象外
    ]
    expect(sumRecentVolume(points, today, 7)).toBe(1500)
  })

  it('直近28日の例', () => {
    const points = [
      { date: '2026-08-11', volumeKg: 999 }, // 29日前: 対象外
      { date: '2026-08-12', volumeKg: 300 }, // 28日前（範囲の開始日）: 対象
      { date: '2026-09-08', volumeKg: 200 }, // 今日: 対象
    ]
    expect(sumRecentVolume(points, today, 28)).toBe(500)
  })

  it('範囲内のデータが無ければ0を返す', () => {
    expect(sumRecentVolume([], today, 7)).toBe(0)
  })
})

describe('sumTotalVolume', () => {
  it('全期間を合計する', () => {
    const points = [
      { date: '2026-01-01', volumeKg: 1000 },
      { date: '2026-09-08', volumeKg: 500 },
    ]
    expect(sumTotalVolume(points)).toBe(1500)
  })

  it('データが無ければ0を返す', () => {
    expect(sumTotalVolume([])).toBe(0)
  })
})
