import { describe, expect, it } from 'vitest'
import { extractInviteCode, inviteLinkPath, safeRedirectPath } from './invite'

describe('inviteLinkPath', () => {
  it('招待ページのパスを返す', () => {
    expect(inviteLinkPath('abc_DEF-123')).toBe('/invite/abc_DEF-123')
  })
})

describe('extractInviteCode', () => {
  it('招待コードだけならそのまま返す(前後の空白は除く)', () => {
    expect(extractInviteCode('  abc_DEF-123 ')).toBe('abc_DEF-123')
  })

  it('招待リンクを丸ごと貼り付けた場合はコード部分を取り出す', () => {
    expect(extractInviteCode('https://torebu-7gf1.vercel.app/invite/abc_DEF-123')).toBe(
      'abc_DEF-123',
    )
  })

  it('共有時の本文ごと貼り付けた場合もコード部分を取り出す', () => {
    expect(
      extractInviteCode(
        '「ベンチプレス部」に招待されています https://example.com/invite/abc_DEF-123',
      ),
    ).toBe('abc_DEF-123')
  })
})

describe('safeRedirectPath', () => {
  it('アプリ内のパスはそのまま返す', () => {
    expect(safeRedirectPath('/invite/abc')).toBe('/invite/abc')
    expect(safeRedirectPath('/groups?tab=1')).toBe('/groups?tab=1')
  })

  it('外部URL・プロトコル相対URLは弾く', () => {
    expect(safeRedirectPath('https://evil.example')).toBeNull()
    expect(safeRedirectPath('//evil.example')).toBeNull()
    expect(safeRedirectPath('/\\evil.example')).toBeNull()
    expect(safeRedirectPath('javascript:alert(1)')).toBeNull()
  })

  it('制御文字を含むものは弾く', () => {
    expect(safeRedirectPath('/\t/evil.example')).toBeNull()
  })

  it('文字列以外(未指定・配列)はnullを返す', () => {
    expect(safeRedirectPath(undefined)).toBeNull()
    expect(safeRedirectPath(['/a', '/b'])).toBeNull()
    expect(safeRedirectPath('')).toBeNull()
  })
})
