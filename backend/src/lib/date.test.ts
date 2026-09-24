import { afterEach, describe, expect, it, vi } from 'vitest'
import { shiftDateString, todayInJst } from './date.js'

// 日本時間(JST)の「今日」判定(Issue #255)。サーバー(Vercel)はUTCで動くため、UTCとJSTで
// 日付がずれる時間帯(UTC15:00〜24:00 = JST0:00〜9:00の前後)の境界を直接検証する

describe('todayInJst', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('UTCの日付とJSTの日付が一致する時間帯(UTC正午)はそのまま同じ日付を返す', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'))
    expect(todayInJst()).toBe('2026-09-24')
  })

  it('UTC日付の変わり目直前(23:59)は、既にJSTでは翌日(朝8:59)のため翌日の日付を返す', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-24T23:59:00Z'))
    expect(todayInJst()).toBe('2026-09-25')
  })

  it('UTC14:59(JST23:59、日付変わる直前)はUTC側の日付のまま', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-24T14:59:00Z'))
    expect(todayInJst()).toBe('2026-09-24')
  })

  it('UTC15:00(JST0:00、日付が変わった直後)はUTC側より1日進む', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-24T15:00:00Z'))
    expect(todayInJst()).toBe('2026-09-25')
  })
})

describe('shiftDateString', () => {
  it('日数を加算できる', () => {
    expect(shiftDateString('2026-09-24', 1)).toBe('2026-09-25')
  })

  it('日数を減算できる', () => {
    expect(shiftDateString('2026-09-24', -1)).toBe('2026-09-23')
  })

  it('月をまたぐ加減算もできる', () => {
    expect(shiftDateString('2026-09-30', 1)).toBe('2026-10-01')
    expect(shiftDateString('2026-10-01', -1)).toBe('2026-09-30')
  })

  it('0日の加減算は同じ日付を返す', () => {
    expect(shiftDateString('2026-09-24', 0)).toBe('2026-09-24')
  })
})
