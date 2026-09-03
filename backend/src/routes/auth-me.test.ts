import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const testEmail = 'auth-me-test@example.com'
const testPassword = 'password123'

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(testPassword, 12)
  await prisma.user.create({
    data: {
      email: testEmail,
      passwordHash,
      displayName: 'meテストユーザー',
    },
  })
})

afterEach(async () => {
  await prisma.$executeRaw`DELETE FROM session`
  await prisma.user.deleteMany({ where: { email: testEmail } })
})

describe('GET /auth/me', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).get('/auth/me')

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'unauthenticated' })
  })

  it('ログイン中なら200でユーザー情報を返す', async () => {
    const agent = request.agent(app)
    await agent.post('/auth/login').send({ email: testEmail, password: testPassword })

    const res = await agent.get('/auth/me')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: expect.any(String),
      email: testEmail,
      displayName: 'meテストユーザー',
    })
  })
})

describe('POST /auth/logout', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app).post('/auth/logout')

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'unauthenticated' })
  })

  it('ログイン中なら204を返し、セッションが破棄される', async () => {
    const agent = request.agent(app)
    await agent.post('/auth/login').send({ email: testEmail, password: testPassword })

    const logoutRes = await agent.post('/auth/logout')
    expect(logoutRes.status).toBe(204)

    // 同じagent(=同じCookie)で/auth/meにアクセスすると未ログイン扱いになる
    const meRes = await agent.get('/auth/me')
    expect(meRes.status).toBe(401)
  })
})
