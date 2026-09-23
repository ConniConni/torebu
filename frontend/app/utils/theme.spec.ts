import { describe, expect, it } from 'vitest'
import { isTheme, resolveStoredTheme } from './theme'

describe('isTheme', () => {
  it('light・darkのみtrueを返す', () => {
    expect(isTheme('light')).toBe(true)
    expect(isTheme('dark')).toBe(true)
  })

  it('それ以外の値はfalseを返す', () => {
    expect(isTheme(null)).toBe(false)
    expect(isTheme(undefined)).toBe(false)
    expect(isTheme('')).toBe(false)
    expect(isTheme('system')).toBe(false)
  })
})

describe('resolveStoredTheme', () => {
  it('保存値がdarkならdarkを返す', () => {
    expect(resolveStoredTheme('dark')).toBe('dark')
  })

  it('保存値がnull・不正値ならlightにフォールバックする', () => {
    expect(resolveStoredTheme(null)).toBe('light')
    expect(resolveStoredTheme('unknown')).toBe('light')
  })
})
