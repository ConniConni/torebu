import { describe, expect, it } from 'vitest'
import {
  countWeeklyTrainingDays,
  sumWeeklyVolume,
  weekStartDate,
  weeklyVolumeTrend,
} from './weeklySummary'

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

describe('weeklyVolumeTrend', () => {
  const today = '2026-09-08' // 火曜日、今週は09-06(日)〜09-12(土)

  it('デフォルトで直近4週分を古い週→新しい週の順で返す', () => {
    const points = [
      { date: '2026-08-16', volumeKg: 100 }, // 3週前(08-16〜08-22)
      { date: '2026-08-25', volumeKg: 200 }, // 2週前(08-23〜08-29)
      { date: '2026-09-02', volumeKg: 300 }, // 1週前(08-30〜09-05)
      { date: '2026-09-06', volumeKg: 400 }, // 今週(09-06〜09-12)
      { date: '2026-09-08', volumeKg: 50 }, // 今週(同じ週に2件)
    ]
    expect(weeklyVolumeTrend(points, today)).toEqual([
      { weekStart: '2026-08-16', label: '3週前', volumeKg: 100 },
      { weekStart: '2026-08-23', label: '2週前', volumeKg: 200 },
      { weekStart: '2026-08-30', label: '1週前', volumeKg: 300 },
      { weekStart: '2026-09-06', label: '今週', volumeKg: 450 },
    ])
  })

  it('データが無い週は0kgとして埋める', () => {
    expect(weeklyVolumeTrend([], today)).toEqual([
      { weekStart: '2026-08-16', label: '3週前', volumeKg: 0 },
      { weekStart: '2026-08-23', label: '2週前', volumeKg: 0 },
      { weekStart: '2026-08-30', label: '1週前', volumeKg: 0 },
      { weekStart: '2026-09-06', label: '今週', volumeKg: 0 },
    ])
  })

  it('weeksを指定すると件数を変えられる', () => {
    const result = weeklyVolumeTrend([], today, 2)
    expect(result).toEqual([
      { weekStart: '2026-08-30', label: '1週前', volumeKg: 0 },
      { weekStart: '2026-09-06', label: '今週', volumeKg: 0 },
    ])
  })
})
