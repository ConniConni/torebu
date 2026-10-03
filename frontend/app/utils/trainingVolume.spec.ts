import { describe, expect, it } from 'vitest'
import { formatKg, sumRecentVolume, sumSetVolumeKg, sumTotalVolume } from './trainingVolume'

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

describe('sumSetVolumeKg', () => {
  it('Σ重量×回数を求め、自重セットは除外する', () => {
    expect(
      sumSetVolumeKg([
        { weightKg: 60, reps: 10 },
        { weightKg: 62.5, reps: 3 },
        { weightKg: null, reps: 15 },
      ]),
    ).toBe(787.5)
  })

  it('セットが無ければ0', () => {
    expect(sumSetVolumeKg([])).toBe(0)
  })
})

describe('formatKg', () => {
  it('3桁区切りのkg表記にする', () => {
    expect(formatKg(3240)).toBe('3,240kg')
    expect(formatKg(0)).toBe('0kg')
  })

  it('端数は小数第1位まで（不要な0は付けない）', () => {
    expect(formatKg(787.5)).toBe('787.5kg')
    expect(formatKg(0.1 + 0.2)).toBe('0.3kg')
  })
})
