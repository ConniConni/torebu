import { describe, expect, it } from 'vitest'
import { countWeeklyTrainingDays, sumWeeklyVolume, weekStartDate } from './weeklySummary'

describe('weekStartDate', () => {
  it('日曜日ならその日自身を返す', () => {
    // 2026-09-06は日曜日
    expect(weekStartDate('2026-09-06')).toBe('2026-09-06')
  })

  it('週の途中の日なら直近の日曜日を返す', () => {
    // 2026-09-08は火曜日 → 直近の日曜は2026-09-06
    expect(weekStartDate('2026-09-08')).toBe('2026-09-06')
  })

  it('土曜日なら同じ週の日曜日を返す', () => {
    // 2026-09-12は土曜日
    expect(weekStartDate('2026-09-12')).toBe('2026-09-06')
  })

  it('月をまたぐ週でも正しく計算する', () => {
    // 2026-10-01は木曜日 → 直近の日曜は2026-09-27
    expect(weekStartDate('2026-10-01')).toBe('2026-09-27')
  })
})

describe('sumWeeklyVolume', () => {
  const today = '2026-09-08' // 火曜日、週は09-06(日)〜09-12(土)

  it('今週の範囲内のみ合計する', () => {
    const points = [
      { date: '2026-09-05', volumeKg: 999 }, // 先週（土）: 対象外
      { date: '2026-09-06', volumeKg: 1000 }, // 今週の日曜: 対象
      { date: '2026-09-08', volumeKg: 500 }, // 今日: 対象
      { date: '2026-09-12', volumeKg: 300 }, // 今週の土曜（未来日）: 対象
      { date: '2026-09-13', volumeKg: 999 }, // 来週の日曜: 対象外
    ]
    expect(sumWeeklyVolume(points, today)).toBe(1800)
  })

  it('今週のデータが無ければ0を返す', () => {
    expect(sumWeeklyVolume([], today)).toBe(0)
  })
})

describe('countWeeklyTrainingDays', () => {
  const today = '2026-09-08'

  it('今週の範囲内の記録日数を、重複を除いて数える', () => {
    const recordedDates = [
      '2026-09-05', // 先週: 対象外
      '2026-09-06', // 今週: 対象
      '2026-09-06', // 同日重複: 1日として数える
      '2026-09-08', // 今週: 対象
      '2026-09-13', // 来週: 対象外
    ]
    expect(countWeeklyTrainingDays(recordedDates, today)).toBe(2)
  })

  it('今週の記録が無ければ0を返す', () => {
    expect(countWeeklyTrainingDays([], today)).toBe(0)
  })
})
