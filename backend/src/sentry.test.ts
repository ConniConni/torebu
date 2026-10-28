// Sentryへ送るイベントに個人情報が載らないことの確認（Issue #403）。
// 送信先（transport）を差し替え、実際にSDKが組み立てて送ろうとした中身（envelope）を検査する。
// ネットワークには一切出ない
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { appendFileSync } from 'node:fs'
import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
import { createTransport } from '@sentry/node'
import { initSentry, maskText, maskUrl, sentryErrorHandler } from './sentry.js'

const sentBodies: string[] = []

// 送信内容にはエラー発生箇所の前後のソースコード（ContextLines）も含まれるため、検査に使う値を
// ソースに直接書くと、伏せられていても「ソースコードとして」見つかってしまう。実行時に組み立てる
const EMAIL = ['user', 'example.com'].join('@')
const INVITE_CODE = 'SECRET' + 'INVITECODE'

const testApp = express()
testApp.use(express.json())
testApp.post('/auth/login', () => {
  throw new Error(`ログイン処理中のエラー ${EMAIL}`)
})
testApp.get('/groups/invites/:code', () => {
  throw new Error('招待コード照会中のエラー')
})
testApp.get('/bad-request', () => {
  throw Object.assign(new Error('入力が不正'), { status: 400 })
})
testApp.use(sentryErrorHandler)

beforeAll(() => {
  initSentry({
    dsn: 'https://public@example.invalid/1',
    transport: (options) =>
      createTransport(options, async (req) => {
        const body = typeof req.body === 'string' ? req.body : new TextDecoder().decode(req.body)
        // envelopeは「ヘッダー行・アイテムヘッダー行・アイテム本体行…」の改行区切り。
        // SDKの統計情報（client_report）などは除き、エラーイベントだけを集める
        if (body.includes('{"type":"event"}')) sentBodies.push(body)
        if (process.env.SENTRY_TEST_DUMP) appendFileSync(process.env.SENTRY_TEST_DUMP, body + '\n')
        return { statusCode: 200 }
      }),
  })
})

afterAll(async () => {
  await Sentry.close()
})

beforeEach(() => {
  sentBodies.length = 0
})

describe('Sentryへの送信内容', () => {
  it('500エラーは送るが、ボディ・Cookie・ヘッダー・メールアドレスは含めない', async () => {
    const res = await request(testApp)
      .post('/auth/login')
      .set('Cookie', 'connect.sid=s%3A' + 'secret-session-id')
      .set('Authorization', 'Bearer ' + 'secret-token')
      .send({ email: EMAIL, password: 'super-' + 'secret-password' })

    expect(res.status).toBe(500)
    expect(sentBodies).toHaveLength(1)
    const sent = sentBodies[0]!
    expect(sent).toContain('ログイン処理中のエラー')
    expect(sent).toContain('[email]')
    expect(sent).toContain('POST /auth/login')
    for (const secret of [EMAIL, 'super-secret-password', 'secret-session-id', 'secret-token']) {
      expect(sent).not.toContain(secret)
    }
  })

  it('URL中の招待コードを伏せる', async () => {
    await request(testApp).get(`/groups/invites/${INVITE_CODE}?x=1`)

    expect(sentBodies).toHaveLength(1)
    expect(sentBodies[0]).not.toContain(INVITE_CODE)
    expect(sentBodies[0]).toContain('/groups/invites/[masked]')
  })

  it('4xxのエラーは送らない', async () => {
    const res = await request(testApp).get('/bad-request')

    expect(res.status).toBe(400)
    expect(sentBodies).toHaveLength(0)
  })
})

describe('maskUrl / maskText', () => {
  it('招待コードを伏せる', () => {
    expect(maskUrl('https://x.test/groups/invites/abc_DEF-1?y=2')).toBe(
      'https://x.test/groups/invites/[masked]?y=2',
    )
  })

  it('メールアドレスとbcryptハッシュを伏せる', () => {
    const hash = '$2b$12$' + 'a'.repeat(53)
    expect(maskText(`email: "taro.yamada+x@mail.example.co.jp", hash: "${hash}"`)).toBe(
      'email: "[email]", hash: "[bcrypt-hash]"',
    )
  })
})
