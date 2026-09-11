import { describe, expect, it } from 'vitest'
import { sumTotalVolume, sumVolumeInMonth } from './trainingVolume'

describe('sumVolumeInMonth', () => {
  const today = '2026-09-08'

  it('todayと同じ年月のみ合計する', () => {
    const points = [
      { date: '2026-08-31', volumeKg: 999 }, // 先月: 対象外
      { date: '2026-09-01', volumeKg: 1000 }, // 今月: 対象
      { date: '2026-09-08', volumeKg: 500 }, // 今日: 対象
      { date: '2026-09-30', volumeKg: 300 }, // 今月の未来日: 対象
      { date: '2026-10-01', volumeKg: 999 }, // 来月: 対象外
    ]
    expect(sumVolumeInMonth(points, today)).toBe(1800)
  })

  it('今月のデータが無ければ0を返す', () => {
    expect(sumVolumeInMonth([], today)).toBe(0)
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
