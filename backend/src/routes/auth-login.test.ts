import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const testEmail = 'auth-login-test@example.com'
const testPassword = 'password123'

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  await prisma.user.create({
    data: {
      email: testEmail,
      passwordHash,
      displayName: 'ログインテストユーザー',
    },
  })
})

afterEach(async () => {
  // セッションのレコードも一緒に片付ける
  await prisma.$executeRaw`DELETE FROM session`
  await prisma.user.deleteMany({ where: { email: testEmail } })
})

describe('POST /auth/login', () => {
  it('正しいemail/passwordでログインに成功し、セッションCookieが発行される', async () => {
    const res = await request(app).post('/auth/login').send({
      email: testEmail,
      password: testPassword,
    })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: expect.any(String),
      email: testEmail,
      displayName: 'ログインテストユーザー',
    })
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('パスワードが違う場合は401(invalid_credentials)を返す', async () => {
    const res = await request(app).post('/auth/login').send({
      email: testEmail,
      password: 'wrongpassword',
    })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'invalid_credentials' })
  })

  it('存在しないメールアドレスの場合も、パスワード違いと同じ401(invalid_credentials)を返す', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'no-such-user@example.com',
      password: 'whatever123',
    })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'invalid_credentials' })
  })

  it('バリデーションエラー(空email)なら400を返す', async () => {
    const res = await request(app).post('/auth/login').send({
      email: '',
      password: testPassword,
    })

    expect(res.status).toBe(400)
  })

  it('ログインのたびにセッションIDが再生成される(セッション固定化対策)', async () => {
    const res1 = await request(app).post('/auth/login').send({
      email: testEmail,
      password: testPassword,
    })
    const res2 = await request(app).post('/auth/login').send({
      email: testEmail,
      password: testPassword,
    })

    const sid1 = res1.headers['set-cookie'][0].match(/connect\.sid=([^;]+)/)?.[1]
    const sid2 = res2.headers['set-cookie'][0].match(/connect\.sid=([^;]+)/)?.[1]

    expect(sid1).toBeDefined()
    expect(sid2).toBeDefined()
    expect(sid1).not.toBe(sid2)
  })
})
