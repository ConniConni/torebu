import { describe, expect, it } from 'vitest'
import { followTodayOnRollover } from './date'

describe('followTodayOnRollover', () => {
  it('旧「今日」を選択中なら新しい「今日」に追従する', () => {
    expect(followTodayOnRollover('2026-10-01', '2026-10-01', '2026-10-02')).toBe('2026-10-02')
  })

  it('別の日を選択中なら動かさない', () => {
    expect(followTodayOnRollover('2026-09-20', '2026-10-01', '2026-10-02')).toBe('2026-09-20')
  })

  it('日付が変わっていなければそのまま', () => {
    expect(followTodayOnRollover('2026-10-01', '2026-10-01', '2026-10-01')).toBe('2026-10-01')
  })
})
