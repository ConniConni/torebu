import { describe, expect, it } from 'vitest'
import {
  estimateOneRepMaxKg,
  oneRepMaxCell,
  oneRepMaxLevel,
  oneRepMaxNotes,
  topNormalEstimate,
} from './oneRepMax'

describe('oneRepMaxLevel', () => {
  it('1〜10回は通常、11〜14回は参考値、それ以外はnull', () => {
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
  it('1回は重量そのまま', () => {
    expect(estimateOneRepMaxKg(100, 1)).toBe(100)
  })
  it('オコナー式で計算し0.1kg単位に丸める', () => {
    expect(estimateOneRepMaxKg(60, 10)).toBe(75)
    expect(estimateOneRepMaxKg(62.5, 8)).toBe(75)
    expect(estimateOneRepMaxKg(65, 6)).toBe(74.8)
    expect(estimateOneRepMaxKg(40, 14)).toBe(54)
  })
  it('15回以上・回数0・未入力・自重（重量なし）はnull', () => {
    expect(estimateOneRepMaxKg(40, 15)).toBeNull()
    expect(estimateOneRepMaxKg(60, 0)).toBeNull()
    expect(estimateOneRepMaxKg(60, null)).toBeNull()
    expect(estimateOneRepMaxKg(null, 8)).toBeNull()
  })
})

describe('oneRepMaxCell', () => {
  it('対象の種目は回数帯どおり（通常／参考値）', () => {
    expect(oneRepMaxCell(60, 10, true)).toEqual({ valueKg: 75, level: 'normal' })
    expect(oneRepMaxCell(50, 12, true)).toEqual({ valueKg: 65, level: 'reference' })
  })
  it('対象外の種目（設定で表示中）は全て参考値', () => {
    expect(oneRepMaxCell(60, 10, false)).toEqual({ valueKg: 75, level: 'reference' })
  })
  it('15回以上・自重はnull', () => {
    expect(oneRepMaxCell(40, 15, true)).toBeNull()
    expect(oneRepMaxCell(null, 8, true)).toBeNull()
  })
})

describe('topNormalEstimate', () => {
  it('通常の値が2つ以上あるとき最大を返す', () => {
    expect(
      topNormalEstimate([
        { valueKg: 75, level: 'normal' },
        { valueKg: 74.8, level: 'normal' },
        null,
      ]),
    ).toBe(75)
  })
  it('参考値は最大でも対象にしない', () => {
    expect(
      topNormalEstimate([
        { valueKg: 80, level: 'reference' },
        { valueKg: 75, level: 'normal' },
        { valueKg: 74.8, level: 'normal' },
      ]),
    ).toBe(75)
  })
  it('通常の値が1つ以下ならnull', () => {
    expect(topNormalEstimate([{ valueKg: 75, level: 'normal' }, null])).toBeNull()
    expect(
      topNormalEstimate([
        { valueKg: 75, level: 'normal' },
        { valueKg: 80, level: 'reference' },
      ]),
    ).toBeNull()
    expect(topNormalEstimate([])).toBeNull()
  })
})

describe('oneRepMaxNotes', () => {
  it('通常の回数だけなら基本の1行', () => {
    expect(oneRepMaxNotes([{ weightKg: 60, reps: 8 }], true)).toEqual(['RM＝推定1RM（オコナー式）'])
  })
  it('11〜14回があれば参考値の説明、15回以上があれば非表示の説明を足す', () => {
    const notes = oneRepMaxNotes(
      [
        { weightKg: 50, reps: 12 },
        { weightKg: 40, reps: 15 },
      ],
      true,
    )
    expect(notes).toContain('グレーの値は11〜14回のセットの参考値です。')
    expect(notes).toContain('15回以上のセットは誤差が大きいため1RMを表示しません。')
  })
  it('15回以上があるときは「RM＝…」の説明を外し、「表示しません」の1行だけにする', () => {
    expect(
      oneRepMaxNotes(
        [
          { weightKg: 60, reps: 8 },
          { weightKg: 40, reps: 15 },
        ],
        true,
      ),
    ).toEqual(['15回以上のセットは誤差が大きいため1RMを表示しません。'])
  })
  it('自重のセットは説明の対象にしない', () => {
    expect(oneRepMaxNotes([{ weightKg: null, reps: 20 }], true)).toEqual([
      'RM＝推定1RM（オコナー式）',
    ])
  })
  it('対象外の種目を設定で表示しているときは参考値の説明を足す', () => {
    expect(oneRepMaxNotes([{ weightKg: 10, reps: 10 }], false)).toContain(
      'この種目は1RMの対象外のため、値は参考値です。（設定で表示中）',
    )
  })
})
