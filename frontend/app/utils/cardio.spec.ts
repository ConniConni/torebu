import { describe, expect, it } from 'vitest'
import {
  buildDaySummaryCells,
  formatCardioSet,
  formatCardioTotal,
  formatDistance,
  formatDuration,
  formatSpeed,
  parseDistanceInput,
  parseDurationInput,
  splitDuration,
  sumDistanceKm,
} from './cardio'

describe('parseDurationInput', () => {
  it('分と秒を秒にする', () => {
    expect(parseDurationInput('30', '15')).toEqual({ ok: true, value: 1815 })
    expect(parseDurationInput(5, 0)).toEqual({ ok: true, value: 300 })
  })
  it('片方だけの入力は空欄を0として扱う', () => {
    expect(parseDurationInput('', '45')).toEqual({ ok: true, value: 45 })
    expect(parseDurationInput('20', '')).toEqual({ ok: true, value: 1200 })
  })
  it('両方空欄はnull（クリア）', () => {
    expect(parseDurationInput('', '')).toEqual({ ok: true, value: null })
  })
  it('秒が60以上・負・小数・0秒・上限超えは不正', () => {
    expect(parseDurationInput('1', '60').ok).toBe(false)
    expect(parseDurationInput('-1', '0').ok).toBe(false)
    expect(parseDurationInput('1.5', '0').ok).toBe(false)
    expect(parseDurationInput('0', '0').ok).toBe(false)
    expect(parseDurationInput('999', '59')).toEqual({ ok: true, value: 59999 })
    expect(parseDurationInput('1000', '0').ok).toBe(false)
  })
})

describe('splitDuration / formatDuration', () => {
  it('秒を分と秒に分け、分:秒で表示する', () => {
    expect(splitDuration(1815)).toEqual({ minutes: '30', seconds: '15' })
    expect(splitDuration(null)).toEqual({ minutes: '', seconds: '' })
    expect(formatDuration(1815)).toBe('30:15')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(5405)).toBe('90:05')
  })
})

describe('parseDistanceInput', () => {
  it('小数第2位までの正の数を受け付け、空欄はnull', () => {
    expect(parseDistanceInput('5')).toEqual({ ok: true, value: 5 })
    expect(parseDistanceInput(5.25)).toEqual({ ok: true, value: 5.25 })
    expect(parseDistanceInput('0.29')).toEqual({ ok: true, value: 0.29 })
    expect(parseDistanceInput('')).toEqual({ ok: true, value: null })
  })
  it('0・負・小数第3位・上限超えは不正', () => {
    expect(parseDistanceInput('0').ok).toBe(false)
    expect(parseDistanceInput('-1').ok).toBe(false)
    expect(parseDistanceInput('1.234').ok).toBe(false)
    expect(parseDistanceInput('1000').ok).toBe(false)
    expect(parseDistanceInput('999.99')).toEqual({ ok: true, value: 999.99 })
  })
})

describe('速さの表示', () => {
  it('pace単位は分/km（秒は四捨五入）', () => {
    expect(formatSpeed({ distanceKm: 5, durationSec: 1800 }, 'pace')).toBe('6:00/km')
    expect(formatSpeed({ distanceKm: 3, durationSec: 1000 }, 'pace')).toBe('5:33/km')
    expect(formatSpeed({ distanceKm: 3, durationSec: 1799 }, 'pace')).toBe('10:00/km')
  })
  it('kmh単位は時速（小数第1位）', () => {
    expect(formatSpeed({ distanceKm: 20, durationSec: 3600 }, 'kmh')).toBe('20.0km/h')
    expect(formatSpeed({ distanceKm: 10, durationSec: 1800 }, 'kmh')).toBe('20.0km/h')
    expect(formatSpeed({ distanceKm: 7.5, durationSec: 1800 }, 'kmh')).toBe('15.0km/h')
  })
  it('距離か時間が欠ける・単位が無いときは表示しない', () => {
    expect(formatSpeed({ distanceKm: 5, durationSec: null }, 'pace')).toBeNull()
    expect(formatSpeed({ distanceKm: null, durationSec: 600 }, 'kmh')).toBeNull()
    expect(formatSpeed({ distanceKm: 5, durationSec: 600 }, null)).toBeNull()
  })
})

describe('formatCardioSet / formatCardioTotal', () => {
  it('入っている項目だけをつなぐ', () => {
    expect(formatCardioSet({ distanceKm: 5, durationSec: 1800 }, 'pace')).toBe(
      '5km・30:00・6:00/km',
    )
    expect(formatCardioSet({ distanceKm: 5.5, durationSec: null }, 'pace')).toBe('5.5km')
    expect(formatCardioSet({ distanceKm: null, durationSec: 600 }, 'kmh')).toBe('10:00')
    expect(formatCardioSet({ distanceKm: null, durationSec: null }, 'pace')).toBe('未入力')
  })
  it('見出しの合計は距離、無ければ時間、どちらも無ければnull', () => {
    expect(
      formatCardioTotal([
        { distanceKm: 3.1, durationSec: 600 },
        { distanceKm: 0.2, durationSec: null },
      ]),
    ).toBe('3.3km')
    expect(formatCardioTotal([{ distanceKm: null, durationSec: 600 }])).toBe('10:00')
    expect(formatCardioTotal([{ distanceKm: null, durationSec: null }])).toBeNull()
  })
  it('距離の合計は小数の誤差を出さない', () => {
    expect(sumDistanceKm([{ distanceKm: 0.1 }, { distanceKm: 0.2 }])).toBe(0.3)
    expect(formatDistance(0.3)).toBe('0.3km')
  })
})

describe('buildDaySummaryCells', () => {
  const strength = (weightKg: number | null, reps: number) => ({
    isCardio: false,
    weightKg,
    reps,
    distanceKm: null,
    durationSec: null,
  })
  const cardio = (distanceKm: number | null, durationSec: number | null) => ({
    isCardio: true,
    weightKg: null,
    reps: null,
    distanceKm,
    durationSec,
  })

  it('筋トレだけの日は従来どおり合計負荷重量とセット数の2マス', () => {
    expect(buildDaySummaryCells([strength(60, 10), strength(60, 8)])).toEqual([
      { key: 'volume', label: '合計負荷重量', value: '1,080kg' },
      { key: 'sets', label: 'セット数', value: '2セット' },
    ])
  })
  it('筋トレもある日は距離を加えた3マスで、セット数は筋トレのみ数える', () => {
    const cells = buildDaySummaryCells([strength(60, 10), cardio(5, 1800), cardio(3, 900)])
    expect(cells.map((c) => c.key)).toEqual(['volume', 'sets', 'distance'])
    expect(cells[1]!.value).toBe('1セット')
    expect(cells[2]!.value).toBe('8km')
  })
  it('有酸素だけの日は距離のみ。距離が無ければ合計時間', () => {
    expect(buildDaySummaryCells([cardio(5, 1800)])).toEqual([
      { key: 'distance', label: '距離', value: '5km' },
    ])
    expect(buildDaySummaryCells([cardio(null, 1800), cardio(null, 600)])).toEqual([
      { key: 'duration', label: '合計時間', value: '40:00' },
    ])
  })
  it('有酸素だけで距離も時間も無い日・セットが無い日は出さない', () => {
    expect(buildDaySummaryCells([cardio(null, null)])).toEqual([])
    expect(buildDaySummaryCells([])).toEqual([])
  })
  it('筋トレ＋距離なし・時間ありの有酸素は3マス目を合計時間にする', () => {
    const cells = buildDaySummaryCells([strength(null, 10), cardio(null, 600)])
    expect(cells.at(-1)).toEqual({ key: 'duration', label: '合計時間', value: '10:00' })
  })
})
