import { describe, expect, it } from 'vitest'
import {
  MAX_CARD_EXERCISES,
  buildShareCardData,
  formatShareCardDate,
  shareLandingUrl,
  topSetText,
} from './shareCard'

describe('formatShareCardDate', () => {
  it('YYYY.MM.DD (曜日)の形にする', () => {
    expect(formatShareCardDate('2026-10-03')).toBe('2026.10.03 (土)')
    expect(formatShareCardDate('2026-10-04')).toBe('2026.10.04 (日)')
  })
})

describe('topSetText', () => {
  it('重量が一番重いセットを選び、同重量なら回数が多い方にする', () => {
    expect(
      topSetText([
        { weightKg: 50, reps: 12 },
        { weightKg: 60, reps: 8 },
        { weightKg: 60, reps: 10 },
      ]),
    ).toBe('60kg × 10回')
  })

  it('自重セットが混ざっていても、重量のあるセットを優先する', () => {
    expect(
      topSetText([
        { weightKg: null, reps: 20 },
        { weightKg: 10, reps: 5 },
      ]),
    ).toBe('10kg × 5回')
  })

  it('全セット自重なら回数が一番多いセットにする', () => {
    expect(
      topSetText([
        { weightKg: null, reps: 12 },
        { weightKg: null, reps: 15 },
      ]),
    ).toBe('自重 × 15回')
  })

  it('小数の重量もそのまま表示する', () => {
    expect(topSetText([{ weightKg: 22.5, reps: 10 }])).toBe('22.5kg × 10回')
  })
})

describe('buildShareCardData', () => {
  it('合計負荷重量は自重セットを除いてΣ重量×回数で求め、種目数・セット数を数える', () => {
    const data = buildShareCardData(
      '2026-10-03',
      [
        {
          name: 'ベンチプレス',
          sets: [
            { weightKg: 60, reps: 10 },
            { weightKg: 60, reps: 8 },
          ],
        },
        { name: '懸垂', sets: [{ weightKg: null, reps: 10 }] },
      ],
      ['2026-10-03'],
    )
    expect(data.totalVolumeKg).toBe(1080)
    expect(data.exerciseCount).toBe(2)
    expect(data.setCount).toBe(3)
    expect(data.exercises).toEqual([
      { name: 'ベンチプレス', topSetText: '60kg × 10回', setCount: 2 },
      { name: '懸垂', topSetText: '自重 × 10回', setCount: 1 },
    ])
    expect(data.hiddenExerciseCount).toBe(0)
  })

  it('セットが無い種目は載せない', () => {
    const data = buildShareCardData(
      '2026-10-03',
      [
        { name: 'スクワット', sets: [] },
        { name: 'デッドリフト', sets: [{ weightKg: 100, reps: 5 }] },
      ],
      ['2026-10-03'],
    )
    expect(data.exerciseCount).toBe(1)
    expect(data.exercises.map((e) => e.name)).toEqual(['デッドリフト'])
  })

  it('通算日数はその日までの記録日（重複なし）を数え、後の日付は含めない', () => {
    const data = buildShareCardData(
      '2026-10-03',
      [{ name: 'ベンチプレス', sets: [{ weightKg: 60, reps: 10 }] }],
      ['2026-09-01', '2026-10-01', '2026-10-03', '2026-10-03', '2026-10-05'],
    )
    expect(data.dayNumber).toBe(3)
  })

  it('載せきれない種目は省略し、その数をhiddenExerciseCountに入れる', () => {
    const exercises = Array.from({ length: MAX_CARD_EXERCISES + 2 }, (_, i) => ({
      name: `種目${i + 1}`,
      sets: [{ weightKg: 10, reps: 10 }],
    }))
    const data = buildShareCardData('2026-10-03', exercises, ['2026-10-03'])
    expect(data.exercises).toHaveLength(MAX_CARD_EXERCISES)
    expect(data.exerciseCount).toBe(MAX_CARD_EXERCISES + 2)
    expect(data.hiddenExerciseCount).toBe(2)
  })
})

describe('shareLandingUrl', () => {
  it('トップページに?ref=shareを付けたURLにする（招待リンクではない）', () => {
    expect(shareLandingUrl('https://torebu.example')).toBe('https://torebu.example/?ref=share')
  })
})
