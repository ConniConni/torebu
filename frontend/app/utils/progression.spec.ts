import { describe, expect, it } from 'vitest'
import { beatsPrevious, compareSet, formatPreviousSession } from './progression'

describe('compareSet', () => {
  it('重量が上なら回数が減っていても↑', () => {
    expect(compareSet({ weightKg: 62.5, reps: 6 }, { weightKg: 60, reps: 8 })).toBe('up')
  })
  it('同じ重量で回数が上なら↑', () => {
    expect(compareSet({ weightKg: 60, reps: 9 }, { weightKg: 60, reps: 8 })).toBe('up')
  })
  it('重量・回数とも同じなら＝', () => {
    expect(compareSet({ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 })).toBe('same')
  })
  it('下がった場合は印なし', () => {
    expect(compareSet({ weightKg: 57.5, reps: 10 }, { weightKg: 60, reps: 8 })).toBeNull()
    expect(compareSet({ weightKg: 60, reps: 7 }, { weightKg: 60, reps: 8 })).toBeNull()
  })
  it('両方とも自重なら回数だけで比べる', () => {
    expect(compareSet({ weightKg: null, reps: 12 }, { weightKg: null, reps: 10 })).toBe('up')
    expect(compareSet({ weightKg: null, reps: 10 }, { weightKg: null, reps: 10 })).toBe('same')
    expect(compareSet({ weightKg: null, reps: 9 }, { weightKg: null, reps: 10 })).toBeNull()
  })
  it('自重と加重が混ざっていれば印なし', () => {
    expect(compareSet({ weightKg: 10, reps: 10 }, { weightKg: null, reps: 10 })).toBeNull()
    expect(compareSet({ weightKg: null, reps: 20 }, { weightKg: 10, reps: 10 })).toBeNull()
  })
  it('どちらかの回数が0（失敗した挑戦）なら印なし', () => {
    expect(compareSet({ weightKg: 70, reps: 0 }, { weightKg: 60, reps: 8 })).toBeNull()
    expect(compareSet({ weightKg: 60, reps: 8 }, { weightKg: 70, reps: 0 })).toBeNull()
  })
  it('前回に同じ番目のセットが無ければ印なし', () => {
    expect(compareSet({ weightKg: 60, reps: 8 }, undefined)).toBeNull()
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
