import { afterEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const testEmail = 'auth-register-test@example.com'

afterEach(async () => {
  // テストで作成したユーザーを開発用DBから片付ける
  await prisma.user.deleteMany({ where: { email: testEmail } })
})

describe('POST /auth/register', () => {
  it('有効な入力で登録に成功し、パスワードハッシュを含まないユーザー情報を返す', async () => {
    const res = await request(app).post('/auth/register').send({
      email: testEmail,
      password: 'password123',
      displayName: 'テストユーザー',
    })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.any(String),
      email: testEmail,
      displayName: 'テストユーザー',
    })
    expect(res.body.passwordHash).toBeUndefined()

    const user = await prisma.user.findUnique({ where: { email: testEmail } })
    expect(user).not.toBeNull()
    expect(user?.passwordHash).not.toBe('password123') // 平文で保存されていないこと
  })

  it('既に登録済みのメールアドレスなら409を返す', async () => {
    await request(app).post('/auth/register').send({
      email: testEmail,
      password: 'password123',
      displayName: '1人目',
    })

    const res = await request(app).post('/auth/register').send({
      email: testEmail,
      password: 'anotherPassword',
      displayName: '2人目',
    })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'email_already_registered' })
  })

  it('不正な形式のメールアドレスなら400を返す', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'not-an-email',
      password: 'password123',
      displayName: 'テストユーザー',
    })

    expect(res.status).toBe(400)
  })

  it('パスワードが8文字未満なら400を返す', async () => {
    const res = await request(app).post('/auth/register').send({
      email: testEmail,
      password: 'short',
      displayName: 'テストユーザー',
    })

    expect(res.status).toBe(400)
  })

  it('displayNameが空文字なら400を返す', async () => {
    const res = await request(app).post('/auth/register').send({
      email: testEmail,
      password: 'password123',
      displayName: '',
    })

    expect(res.status).toBe(400)
  })
})
