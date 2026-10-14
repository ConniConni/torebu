import { describe, expect, it } from 'vitest'
import { estimateOneRepMaxKg, roundToTenth } from './oneRepMax.js'

describe('estimateOneRepMaxKg', () => {
  it('1回のセットは重量そのまま', () => {
    expect(estimateOneRepMaxKg(100, 1)).toBe(100)
  })

  it('Epley式で計算する(60kg×10回 = 80)', () => {
    expect(estimateOneRepMaxKg(60, 10)).toBeCloseTo(80)
  })

  it('12回までは対象', () => {
    expect(estimateOneRepMaxKg(50, 12)).toBeCloseTo(70)
  })

  it('13回以上は対象外(null)', () => {
    expect(estimateOneRepMaxKg(40, 13)).toBeNull()
    expect(estimateOneRepMaxKg(40, 15)).toBeNull()
  })

  it('回数が0・nullなら対象外(null)', () => {
    expect(estimateOneRepMaxKg(60, 0)).toBeNull()
    expect(estimateOneRepMaxKg(60, null)).toBeNull()
  })
})

describe('roundToTenth', () => {
  it('0.1kg単位に丸める', () => {
    expect(roundToTenth(77.5)).toBe(77.5)
    expect(roundToTenth(78.04)).toBe(78)
    expect(roundToTenth(62.5 * (1 + 7 / 30))).toBe(77.1)
  })
})
