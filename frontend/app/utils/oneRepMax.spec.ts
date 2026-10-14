import { describe, expect, it } from 'vitest'
import { estimateOneRepMaxKg, topEstimate } from './oneRepMax'

describe('estimateOneRepMaxKg', () => {
  it('1回は重量そのまま', () => {
    expect(estimateOneRepMaxKg(100, 1)).toBe(100)
  })
  it('Epley式で計算し0.1kg単位に丸める', () => {
    expect(estimateOneRepMaxKg(60, 10)).toBe(80)
    expect(estimateOneRepMaxKg(62.5, 8)).toBe(79.2)
    expect(estimateOneRepMaxKg(65, 6)).toBe(78)
  })
  it('12回までは対象、13回以上は対象外', () => {
    expect(estimateOneRepMaxKg(50, 12)).toBe(70)
    expect(estimateOneRepMaxKg(40, 13)).toBeNull()
    expect(estimateOneRepMaxKg(40, 15)).toBeNull()
  })
  it('回数が0・未入力、自重（重量なし）は対象外', () => {
    expect(estimateOneRepMaxKg(60, 0)).toBeNull()
    expect(estimateOneRepMaxKg(60, null)).toBeNull()
    expect(estimateOneRepMaxKg(null, 12)).toBeNull()
  })
})

describe('topEstimate', () => {
  it('値が2つ以上あるとき最大を返す', () => {
    expect(topEstimate([79.2, 78, null])).toBe(79.2)
  })
  it('値が1つ以下ならnull', () => {
    expect(topEstimate([79.2, null, null])).toBeNull()
    expect(topEstimate([null])).toBeNull()
    expect(topEstimate([])).toBeNull()
  })
})
