import { afterEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { prisma } from '../prisma.js'

const testEmail = 'auth-register-test@example.com'

// 生年月・性別・職業は全て必須のため、個別のテストで上書きしやすいよう共通の有効な入力を用意する
const validPayload = {
  email: testEmail,
  password: 'password123',
  displayName: 'テストユーザー',
  birthYearMonth: { year: 2000, month: 5 },
  gender: 'no_answer',
  occupation: 'no_answer',
}

afterEach(async () => {
  // テストで作成したユーザーを開発用DBから片付ける
  await prisma.user.deleteMany({ where: { email: testEmail } })
})

describe('POST /auth/register', () => {
  it('有効な入力で登録に成功し、パスワードハッシュを含まないユーザー情報を返す', async () => {
    const res = await request(app).post('/auth/register').send(validPayload)

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

  it('生年月・性別・職業が「回答しない」でも登録に成功し、生年月日はnullで保存される', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validPayload, birthYearMonth: 'no_answer' })

    expect(res.status).toBe(201)
    const user = await prisma.user.findUnique({ where: { email: testEmail } })
    expect(user?.birthDate).toBeNull()
    expect(user?.gender).toBe('no_answer')
    expect(user?.occupation).toBe('no_answer')
  })

  it('生年月に年月が指定されると、日を1日固定にしたbirthDateが保存される', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        ...validPayload,
        birthYearMonth: { year: 2000, month: 5 },
        gender: 'male',
        occupation: 'student',
      })

    expect(res.status).toBe(201)
    const user = await prisma.user.findUnique({ where: { email: testEmail } })
    expect(user?.birthDate?.toISOString().slice(0, 10)).toBe('2000-05-01')
    expect(user?.gender).toBe('male')
    expect(user?.occupation).toBe('student')
  })

  it('既に登録済みのメールアドレスなら409を返す', async () => {
    await request(app).post('/auth/register').send(validPayload)

    const res = await request(app)
      .post('/auth/register')
      .send({ ...validPayload, password: 'anotherPassword', displayName: '2人目' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'email_already_registered' })
  })

  it('不正な形式のメールアドレスなら400を返す', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validPayload, email: 'not-an-email' })

    expect(res.status).toBe(400)
  })

  it('パスワードが8文字未満なら400を返す', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validPayload, password: 'short' })

    expect(res.status).toBe(400)
  })

  it('displayNameが空文字なら400を返す', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validPayload, displayName: '' })

    expect(res.status).toBe(400)
  })

  it('birthYearMonthが無ければ400を返す', async () => {
    const rest: Partial<typeof validPayload> = { ...validPayload }
    delete rest.birthYearMonth
    const res = await request(app).post('/auth/register').send(rest)

    expect(res.status).toBe(400)
  })

  it('genderが無ければ400を返す', async () => {
    const rest: Partial<typeof validPayload> = { ...validPayload }
    delete rest.gender
    const res = await request(app).post('/auth/register').send(rest)

    expect(res.status).toBe(400)
  })

  it('occupationが未知の値なら400を返す', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validPayload, occupation: 'invalid_value' })

    expect(res.status).toBe(400)
  })
})
