import { describe, expect, it } from 'vitest'
import { beatsPrevious, beatsTopSet, findTopSet, formatPreviousSession } from './progression'

describe('findTopSet', () => {
  it('加重セットのうち最も重いセット、同じ重量なら回数が多いセット', () => {
    expect(
      findTopSet([
        { weightKg: 40, reps: 10 },
        { weightKg: 60, reps: 7 },
        { weightKg: 60, reps: 8 },
        { weightKg: 50, reps: 12 },
      ]),
    ).toEqual({ weightKg: 60, reps: 8 })
  })
  it('自重セットが混ざっていても加重セットから選ぶ', () => {
    expect(
      findTopSet([
        { weightKg: null, reps: 20 },
        { weightKg: 5, reps: 8 },
      ]),
    ).toEqual({ weightKg: 5, reps: 8 })
  })
  it('全セット自重なら回数が最も多いセット', () => {
    expect(
      findTopSet([
        { weightKg: null, reps: 10 },
        { weightKg: null, reps: 12 },
      ]),
    ).toEqual({ weightKg: null, reps: 12 })
  })
  it('回数0（失敗した挑戦）はトップにしない。候補が無ければnull', () => {
    expect(
      findTopSet([
        { weightKg: 70, reps: 0 },
        { weightKg: 60, reps: 8 },
      ]),
    ).toEqual({ weightKg: 60, reps: 8 })
    expect(findTopSet([{ weightKg: 70, reps: 0 }])).toBeNull()
    expect(findTopSet([])).toBeNull()
  })
})

describe('beatsTopSet', () => {
  const top = { weightKg: 60, reps: 8 }
  it('重量が上なら回数が減っていてもtrue', () => {
    expect(beatsTopSet({ weightKg: 62.5, reps: 6 }, top)).toBe(true)
  })
  it('同じ重量で回数が上ならtrue', () => {
    expect(beatsTopSet({ weightKg: 60, reps: 9 }, top)).toBe(true)
  })
  it('同じ・下がった場合はfalse（＝や下がった印は出さない）', () => {
    expect(beatsTopSet({ weightKg: 60, reps: 8 }, top)).toBe(false)
    expect(beatsTopSet({ weightKg: 60, reps: 7 }, top)).toBe(false)
    expect(beatsTopSet({ weightKg: 57.5, reps: 12 }, top)).toBe(false)
  })
  it('ウォームアップ（トップより軽いセット）は回数が多くてもfalse', () => {
    expect(beatsTopSet({ weightKg: 40, reps: 15 }, top)).toBe(false)
  })
  it('トップが自重なら、今回も自重のときだけ回数で比べる', () => {
    const bodyweightTop = { weightKg: null, reps: 10 }
    expect(beatsTopSet({ weightKg: null, reps: 11 }, bodyweightTop)).toBe(true)
    expect(beatsTopSet({ weightKg: null, reps: 10 }, bodyweightTop)).toBe(false)
    expect(beatsTopSet({ weightKg: 5, reps: 10 }, bodyweightTop)).toBe(false)
    expect(beatsTopSet({ weightKg: null, reps: 30 }, top)).toBe(false)
  })
  it('今回の回数が0、またはトップが無ければfalse', () => {
    expect(beatsTopSet({ weightKg: 70, reps: 0 }, top)).toBe(false)
    expect(beatsTopSet({ weightKg: 60, reps: 8 }, null)).toBe(false)
  })
})

describe('beatsPrevious', () => {
  it('合計負荷重量が前回を上回ればtrue、同じか下ならfalse', () => {
    const previous = [
      { weightKg: 60, reps: 8 },
      { weightKg: 60, reps: 8 },
    ]
    expect(
      beatsPrevious(
        [
          { weightKg: 60, reps: 9 },
          { weightKg: 60, reps: 8 },
        ],
        previous,
      ),
    ).toBe(true)
    expect(
      beatsPrevious(
        [
          { weightKg: 60, reps: 8 },
          { weightKg: 60, reps: 8 },
        ],
        previous,
      ),
    ).toBe(false)
    expect(beatsPrevious([{ weightKg: 60, reps: 8 }], previous)).toBe(false)
  })
  it('自重セットは合計負荷重量に含めない（統計と同じ定義）', () => {
    const previous = [{ weightKg: 60, reps: 8 }]
    expect(
      beatsPrevious(
        [
          { weightKg: 60, reps: 8 },
          { weightKg: null, reps: 50 },
        ],
        previous,
      ),
    ).toBe(false)
  })
  it('今回・前回とも全セット自重なら合計回数で比べる', () => {
    const previous = [
      { weightKg: null, reps: 10 },
      { weightKg: null, reps: 8 },
    ]
    expect(
      beatsPrevious(
        [
          { weightKg: null, reps: 10 },
          { weightKg: null, reps: 9 },
        ],
        previous,
      ),
    ).toBe(true)
    expect(beatsPrevious([{ weightKg: null, reps: 18 }], previous)).toBe(false)
  })
  it('前回が全セット自重で今回が加重なら、合計負荷重量（前回0kg）で比べる', () => {
    expect(beatsPrevious([{ weightKg: 5, reps: 10 }], [{ weightKg: null, reps: 20 }])).toBe(true)
  })
  it('今回が全セット自重で前回が加重なら、合計負荷重量（今回0kg）で比べて超えない', () => {
    expect(beatsPrevious([{ weightKg: null, reps: 30 }], [{ weightKg: 5, reps: 10 }])).toBe(false)
  })
})

describe('formatPreviousSession', () => {
  it('前回の日付（月/日）と全セットを1行にする。自重は「自重」', () => {
    expect(
      formatPreviousSession(
        {
          performedAt: '2026-10-10',
          sets: [
            { weightKg: 60, reps: 8 },
            { weightKg: 57.5, reps: 7 },
            { weightKg: null, reps: 12 },
          ],
        },
        '2026-10-14',
      ),
    ).toBe('前回 10/10：60kg×8・57.5kg×7・自重×12')
  })
  it('対象日と年が違えば年も付ける', () => {
    expect(
      formatPreviousSession(
        { performedAt: '2025-12-28', sets: [{ weightKg: 40, reps: 10 }] },
        '2026-01-03',
      ),
    ).toBe('前回 2025/12/28：40kg×10')
  })
})
