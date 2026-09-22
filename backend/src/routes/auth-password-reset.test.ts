import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const testEmail = 'auth-password-reset-test@example.com'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

async function createTestUser() {
  return prisma.user.create({
    data: {
      email: testEmail,
      passwordHash: '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345', // ダミー
      displayName: 'テストユーザー',
    },
  })
}

afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: testEmail } })
})

describe('POST /auth/password-reset-requests', () => {
  it('存在するメールアドレスなら202を返し、トークンと有効期限が保存される', async () => {
    await createTestUser()

    const res = await request(app).post('/auth/password-reset-requests').send({ email: testEmail })

    expect(res.status).toBe(202)

    const user = await prisma.user.findUnique({ where: { email: testEmail } })
    expect(user?.passwordResetToken).not.toBeNull()
    expect(user?.passwordResetExpiresAt?.getTime()).toBeGreaterThan(Date.now())
  })

  it('存在しないメールアドレスでも202を返す（列挙対策）', async () => {
    const res = await request(app)
      .post('/auth/password-reset-requests')
      .send({ email: 'not-registered@example.com' })

    expect(res.status).toBe(202)
  })

  it('不正な形式のメールアドレスなら400を返す', async () => {
    const res = await request(app)
      .post('/auth/password-reset-requests')
      .send({ email: 'not-an-email' })

    expect(res.status).toBe(400)
  })
})

describe('POST /auth/password-resets', () => {
  it('有効なトークンなら200を返し、パスワードが更新されトークンが失効する', async () => {
    const user = await createTestUser()
    const token = 'valid-test-token'
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashToken(token),
        passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    })

    const res = await request(app)
      .post('/auth/password-resets')
      .send({ token, password: 'newPassword123' })

    expect(res.status).toBe(200)

    const updated = await prisma.user.findUnique({ where: { id: user.id } })
    expect(updated?.passwordHash).not.toBe(user.passwordHash)
    expect(updated?.passwordResetToken).toBeNull()
    expect(updated?.passwordResetExpiresAt).toBeNull()

    // 使用済みトークンは再利用できない
    const reuseRes = await request(app)
      .post('/auth/password-resets')
      .send({ token, password: 'anotherPassword123' })
    expect(reuseRes.status).toBe(400)
  })

  it('期限切れのトークンなら400を返す', async () => {
    const user = await createTestUser()
    const token = 'expired-test-token'
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashToken(token),
        passwordResetExpiresAt: new Date(Date.now() - 1000),
      },
    })

    const res = await request(app)
      .post('/auth/password-resets')
      .send({ token, password: 'newPassword123' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_or_expired_token' })
  })

  it('存在しないトークンなら400を返す', async () => {
    const res = await request(app)
      .post('/auth/password-resets')
      .send({ token: 'nonexistent-token', password: 'newPassword123' })

    expect(res.status).toBe(400)
  })

  it('パスワードが8文字未満なら400を返す', async () => {
    const user = await createTestUser()
    const token = 'short-password-test-token'
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashToken(token),
        passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    })

    const res = await request(app).post('/auth/password-resets').send({ token, password: 'short' })

    expect(res.status).toBe(400)
  })
})
