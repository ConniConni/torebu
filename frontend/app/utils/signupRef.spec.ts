import { describe, expect, it } from 'vitest'
import { parseSignupRef } from './signupRef'

describe('parseSignupRef', () => {
  it('"share"はそのまま返す', () => {
    expect(parseSignupRef('share')).toBe('share')
  })

  it('許可していない値・文字列以外はnullにする', () => {
    expect(parseSignupRef('evil')).toBeNull()
    expect(parseSignupRef('')).toBeNull()
    expect(parseSignupRef(undefined)).toBeNull()
    expect(parseSignupRef(['share'])).toBeNull()
  })
})
