import { describe, expect, it } from 'vitest'
import { formatDateLabel, toLineChartData } from './statsChart'

describe('formatDateLabel', () => {
  it('YYYY-MM-DDを"M/D"に変換する（先頭の0を落とす）', () => {
    expect(formatDateLabel('2026-01-05')).toBe('1/5')
    expect(formatDateLabel('2026-09-08')).toBe('9/8')
    expect(formatDateLabel('2026-12-31')).toBe('12/31')
  })
})

describe('toLineChartData', () => {
  it('空配列なら空のlabels/dataになる（データが無い期間の表示）', () => {
    expect(toLineChartData([], '合計挙上重量(kg)')).toEqual({
      labels: [],
      datasets: [{ label: '合計挙上重量(kg)', data: [] }],
    })
  })

  it('1件のみでも配列として扱う', () => {
    expect(toLineChartData([{ date: '2026-09-08', value: 120 }], '合計挙上重量(kg)')).toEqual({
      labels: ['9/8'],
      datasets: [{ label: '合計挙上重量(kg)', data: [120] }],
    })
  })

  it('複数件は日付順のまま（並び替えはAPI側の責務）labels/dataに変換する', () => {
    const points = [
      { date: '2026-09-01', value: 100 },
      { date: '2026-09-03', value: 0 },
      { date: '2026-09-08', value: 250.5 },
    ]
    expect(toLineChartData(points, '最大重量(kg)')).toEqual({
      labels: ['9/1', '9/3', '9/8'],
      datasets: [{ label: '最大重量(kg)', data: [100, 0, 250.5] }],
    })
  })
})
