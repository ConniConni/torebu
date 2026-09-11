import { describe, expect, it } from 'vitest'
import { countRecentTrainingDays, countTotalTrainingDays } from './trainingDays'

describe('countRecentTrainingDays', () => {
  const today = '2026-09-08'

  it('today起算でdays日前〜todayの範囲内の記録日数を、重複を除いて数える（直近7日の例）', () => {
    const recordedDates = [
      '2026-09-01', // 8日前: 対象外
      '2026-09-02', // 7日前（範囲の開始日）: 対象
      '2026-09-02', // 同日重複: 1日として数える
      '2026-09-08', // 今日: 対象
      '2026-09-09', // 未来日: 対象外
    ]
    expect(countRecentTrainingDays(recordedDates, today, 7)).toBe(2)
  })

  it('直近28日の例', () => {
    const recordedDates = ['2026-08-11', '2026-08-12', '2026-09-08']
    expect(countRecentTrainingDays(recordedDates, today, 28)).toBe(2)
  })

  it('範囲内の記録が無ければ0を返す', () => {
    expect(countRecentTrainingDays([], today, 7)).toBe(0)
  })
})

describe('countTotalTrainingDays', () => {
  it('全期間の記録日数を、重複を除いて数える', () => {
    expect(countTotalTrainingDays(['2026-01-01', '2026-01-01', '2026-09-08'])).toBe(2)
  })

  it('記録が無ければ0を返す', () => {
    expect(countTotalTrainingDays([])).toBe(0)
  })
})
