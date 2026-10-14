import { describe, expect, it } from 'vitest'
import {
  barPercent,
  formatOneRmKg,
  formatPeriod,
  formatSignedDays,
  formatSignedPct,
  formatVolumeKg,
  growthDirection,
  splitVisibleExercises,
  type GrowthExercise,
} from './growth'

function ex(name: string, growthPct: number | null): GrowthExercise {
  return { exerciseId: name, name, previousKg: 50, currentKg: 55, growthPct }
}

describe('barPercent', () => {
  const list = [ex('a', 10.3), ex('b', 5.3), ex('c', 0), ex('d', -2.1)]
  it('いちばん大きい伸びを100%とした相対値にする', () => {
    expect(barPercent(10.3, list)).toBe(100)
    expect(barPercent(5.3, list)).toBe(51)
  })
  it('0以下・nullは棒なし', () => {
    expect(barPercent(0, list)).toBeNull()
    expect(barPercent(-2.1, list)).toBeNull()
    expect(barPercent(null, list)).toBeNull()
  })
  it('伸びた種目が1つだけならその種目が100%', () => {
    expect(barPercent(3, [ex('a', 3), ex('b', -1)])).toBe(100)
  })
  it('伸びた種目が無ければ全て棒なし', () => {
    expect(barPercent(0, [ex('a', 0)])).toBeNull()
  })
})

describe('splitVisibleExercises', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((n, i) => ex(n, 10 - i))
  it('上限（5）以下なら全部出す', () => {
    expect(splitVisibleExercises(six.slice(0, 5), false)).toEqual({
      visible: six.slice(0, 5),
      hiddenCount: 0,
    })
  })
  it('6種目以上は先頭5種目だけ出し、残りの数を返す', () => {
    const r = splitVisibleExercises(six, false)
    expect(r.visible.map((e) => e.name)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(r.hiddenCount).toBe(1)
  })
  it('展開したら全部出す', () => {
    expect(splitVisibleExercises(six, true)).toEqual({ visible: six, hiddenCount: 0 })
  })
})

describe('表示の整形', () => {
  it('伸び率の符号', () => {
    expect(formatSignedPct(10.3)).toBe('+10.3%')
    expect(formatSignedPct(-2.1)).toBe('−2.1%')
    expect(formatSignedPct(0)).toBe('±0')
    expect(formatSignedPct(null)).toBe('—')
  })
  it('日数の差', () => {
    expect(formatSignedDays(2)).toBe('+2日')
    expect(formatSignedDays(-1)).toBe('−1日')
    expect(formatSignedDays(0)).toBe('±0日')
  })
  it('向き', () => {
    expect(growthDirection(1)).toBe('up')
    expect(growthDirection(-1)).toBe('down')
    expect(growthDirection(0)).toBe('flat')
    expect(growthDirection(null)).toBeNull()
  })
  it('kgと合計負荷重量', () => {
    expect(formatOneRmKg(80)).toBe('80.0')
    expect(formatOneRmKg(72.5)).toBe('72.5')
    expect(formatVolumeKg(48200)).toBe('48,200')
  })
  it('期間', () => {
    expect(formatPeriod('2026-09-16', '2026-10-15')).toBe('9/16〜10/15')
  })
})
