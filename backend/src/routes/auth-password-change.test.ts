import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const testEmail = 'auth-password-change-test@example.com'
const currentPassword = 'password123'
const newPassword = 'newPassword456'

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(currentPassword, 12)
  await prisma.user.create({
    data: {
      email: testEmail,
      passwordHash,
      displayName: 'パスワード変更テストユーザー',
    },
  })
})

afterEach(async () => {
  await prisma.$executeRaw`DELETE FROM session`
  await prisma.user.deleteMany({ where: { email: testEmail } })
})

async function loggedInAgent() {
  const agent = request.agent(app)
  await agent.post('/auth/login').send({ email: testEmail, password: currentPassword })
  return agent
}

describe('POST /auth/password-changes', () => {
  it('未ログインなら401を返す', async () => {
    const res = await request(app)
      .post('/auth/password-changes')
      .send({ currentPassword, newPassword })

    expect(res.status).toBe(401)
  })

  it('現在のパスワードが正しければ200を返し、新しいパスワードでのみログインできる', async () => {
    const agent = await loggedInAgent()

    const res = await agent.post('/auth/password-changes').send({ currentPassword, newPassword })

    expect(res.status).toBe(200)

    // 変更後も現在のセッションはログイン状態のまま
    const me = await agent.get('/auth/me')
    expect(me.status).toBe(200)

    const oldLogin = await request(app)
      .post('/auth/login')
      .send({ email: testEmail, password: currentPassword })
    expect(oldLogin.status).toBe(401)

    const newLogin = await request(app)
      .post('/auth/login')
      .send({ email: testEmail, password: newPassword })
    expect(newLogin.status).toBe(200)
  })

  it('現在のパスワードが誤っていれば400を返し、パスワードは変わらずログイン状態も維持される', async () => {
    const agent = await loggedInAgent()
    const before = await prisma.user.findUnique({ where: { email: testEmail } })

    const res = await agent
      .post('/auth/password-changes')
      .send({ currentPassword: 'wrongPassword', newPassword })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_current_password' })

    const after = await prisma.user.findUnique({ where: { email: testEmail } })
    expect(after?.passwordHash).toBe(before?.passwordHash)

    const me = await agent.get('/auth/me')
    expect(me.status).toBe(200)
  })

  it('新しいパスワードが現在のパスワードと同じなら400を返し、パスワードは変わらない', async () => {
    const agent = await loggedInAgent()
    const before = await prisma.user.findUnique({ where: { email: testEmail } })

    const res = await agent
      .post('/auth/password-changes')
      .send({ currentPassword, newPassword: currentPassword })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'same_as_current_password' })

    const after = await prisma.user.findUnique({ where: { email: testEmail } })
    expect(after?.passwordHash).toBe(before?.passwordHash)
  })

  it('現在のパスワードが誤っていれば、新旧が同じ入力でも現在のパスワードの誤りを優先して返す', async () => {
    const agent = await loggedInAgent()

    const res = await agent
      .post('/auth/password-changes')
      .send({ currentPassword: 'wrongPassword', newPassword: 'wrongPassword' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_current_password' })
  })

  it('新しいパスワードが8文字未満なら400を返す', async () => {
    const agent = await loggedInAgent()

    const res = await agent
      .post('/auth/password-changes')
      .send({ currentPassword, newPassword: 'short' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_request')
  })

  it('新しいパスワードが72文字を超えるなら400を返す', async () => {
    const agent = await loggedInAgent()

    const res = await agent
      .post('/auth/password-changes')
      .send({ currentPassword, newPassword: 'a'.repeat(73) })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_request')
  })

  it('未使用のメールリセット用トークンが残っていれば失効させる', async () => {
    await prisma.user.update({
      where: { email: testEmail },
      data: {
        passwordResetToken: 'dummy-token-hash',
        passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    })
    const agent = await loggedInAgent()

    const res = await agent.post('/auth/password-changes').send({ currentPassword, newPassword })

    expect(res.status).toBe(200)
    const user = await prisma.user.findUnique({ where: { email: testEmail } })
    expect(user?.passwordResetToken).toBeNull()
    expect(user?.passwordResetExpiresAt).toBeNull()
  })
})
