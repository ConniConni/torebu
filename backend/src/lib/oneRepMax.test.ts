import { describe, expect, it } from 'vitest'
import { estimateOneRepMaxKg, oneRepMaxLevel, roundToTenth } from './oneRepMax.js'
import { isOneRmTarget } from './oneRepMaxTarget.js'

describe('oneRepMaxLevel', () => {
  it('1〜10回は通常、11〜14回は参考値、それ以外は対象外', () => {
    expect(oneRepMaxLevel(1)).toBe('normal')
    expect(oneRepMaxLevel(10)).toBe('normal')
    expect(oneRepMaxLevel(11)).toBe('reference')
    expect(oneRepMaxLevel(14)).toBe('reference')
    expect(oneRepMaxLevel(15)).toBeNull()
    expect(oneRepMaxLevel(0)).toBeNull()
    expect(oneRepMaxLevel(null)).toBeNull()
  })
})

describe('estimateOneRepMaxKg', () => {
  it('1回のセットは重量そのまま', () => {
    expect(estimateOneRepMaxKg(100, 1)).toBe(100)
  })

  it('オコナー式で計算する(60kg×10回 = 75)', () => {
    expect(estimateOneRepMaxKg(60, 10)).toBeCloseTo(75)
  })

  it('11〜14回も計算する(参考値)', () => {
    expect(estimateOneRepMaxKg(40, 14)).toBeCloseTo(54)
  })

  it('15回以上・回数0・nullは対象外(null)', () => {
    expect(estimateOneRepMaxKg(40, 15)).toBeNull()
    expect(estimateOneRepMaxKg(60, 0)).toBeNull()
    expect(estimateOneRepMaxKg(60, null)).toBeNull()
  })
})

describe('roundToTenth', () => {
  it('0.1kg単位に丸める(65kg×6回は74.8で、半端な重量でも誤差で外れない)', () => {
    expect(roundToTenth(estimateOneRepMaxKg(65, 6)!)).toBe(74.8)
    expect(roundToTenth(estimateOneRepMaxKg(62.5, 8)!)).toBe(75)
    expect(roundToTenth(78.04)).toBe(78)
  })
})

describe('isOneRmTarget', () => {
  it('公式の複合関節種目は対象', () => {
    expect(isOneRmTarget({ name: 'ベンチプレス', createdBy: null })).toBe(true)
    expect(isOneRmTarget({ name: 'ヒップスラスト', createdBy: null })).toBe(true)
    expect(isOneRmTarget({ name: 'レッグプレス', createdBy: null })).toBe(true)
  })
  it('単関節・自重・マシンの対象外種目は対象外', () => {
    expect(isOneRmTarget({ name: 'ダンベルサイドレイズ', createdBy: null })).toBe(false)
    expect(isOneRmTarget({ name: 'ラットプルダウン', createdBy: null })).toBe(false)
    expect(isOneRmTarget({ name: 'ルーマニアンデッドリフト', createdBy: null })).toBe(false)
    expect(isOneRmTarget({ name: 'ディップス', createdBy: null })).toBe(false)
  })
  it('カスタム種目は同名でも対象外', () => {
    expect(isOneRmTarget({ name: 'ベンチプレス', createdBy: 'user-1' })).toBe(false)
  })
})
