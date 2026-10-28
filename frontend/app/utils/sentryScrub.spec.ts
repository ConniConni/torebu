import { describe, expect, it } from 'vitest'
import type { ErrorEvent } from '@sentry/vue'
import { maskText, maskUrl, scrubBreadcrumb, scrubEvent } from './sentryScrub'

describe('maskUrl', () => {
  it('招待コード・パスワード再設定トークンを伏せる', () => {
    expect(maskUrl('https://torebu.com/invite/abc_DEF-1')).toBe(
      'https://torebu.com/invite/[masked]',
    )
    expect(maskUrl('/api/groups/invites/abc_DEF-1')).toBe('/api/groups/invites/[masked]')
    expect(maskUrl('https://torebu.com/password-reset/tok123')).toBe(
      'https://torebu.com/password-reset/[masked]',
    )
  })

  it('クエリとハッシュを落とす', () => {
    expect(maskUrl('https://torebu.com/login?redirect=/invite/abc#x')).toBe(
      'https://torebu.com/login',
    )
  })

  it('秘密の値を含まないURLはそのまま', () => {
    expect(maskUrl('https://torebu.com/workouts/12')).toBe('https://torebu.com/workouts/12')
  })
})

describe('maskText', () => {
  it('メールアドレスを伏せる', () => {
    expect(maskText('登録失敗: taro+x@mail.example.co.jp')).toBe('登録失敗: [email]')
  })
})

describe('scrubEvent', () => {
  it('URL・User-Agent以外のリクエスト情報とユーザー情報を落とす', () => {
    const event = {
      type: undefined,
      message: 'user@example.com で失敗',
      user: { id: '1', email: 'user@example.com', ip_address: '203.0.113.1' },
      contexts: {
        vue: { componentName: '<CommentList>', propsData: { body: 'secret-comment' } },
      },
      request: {
        url: 'https://torebu.com/password-reset/secret-token?x=1',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://torebu.com/invite/secret-code',
          Cookie: 'connect.sid=secret-session',
        },
        cookies: { 'connect.sid': 'secret-session' },
        query_string: 'x=1',
        data: { email: 'user@example.com', password: 'secret-password' },
      },
      exception: {
        values: [
          {
            value: 'fetch failed for user@example.com',
            stacktrace: { frames: [{ filename: 'https://torebu.com/invite/secret-code' }] },
          },
        ],
      },
      breadcrumbs: [
        { category: 'console', message: 'password=secret-password' },
        { category: 'navigation', data: { from: '/invite/secret-code', to: '/' } },
        { category: 'fetch', data: { url: '/api/groups/invites/secret-code', method: 'GET' } },
      ],
    } as unknown as ErrorEvent

    const sent = JSON.stringify(scrubEvent(event))

    for (const secret of [
      'secret-token',
      'secret-code',
      'secret-session',
      'secret-password',
      'secret-comment',
      'user@example.com',
      '203.0.113.1',
    ]) {
      expect(sent).not.toContain(secret)
    }
    expect(event.request).toEqual({
      url: 'https://torebu.com/password-reset/[masked]',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    expect(event.user).toBeUndefined()
    expect(event.contexts?.vue).toEqual({ componentName: '<CommentList>' })
    expect(event.breadcrumbs).toHaveLength(2)
  })
})

describe('scrubBreadcrumb', () => {
  it('consoleのパンくずは送らない', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'x' })).toBeNull()
  })
})
