import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../prisma.js'

export const authRouter = Router()

// bcryptのソルトラウンド数。大きいほど安全だが計算コストが上がる。12は一般的な推奨値
const BCRYPT_SALT_ROUNDS = 12

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72), // bcryptは72バイトを超える部分を無視するため上限を設ける
  displayName: z.string().trim().min(1).max(50),
})

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() })
    return
  }
  const { email, password, displayName } = parsed.data

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    // 登録APIでは「既に使われているか」を伝える必要があるため、列挙対策の対象外とする
    // （ログインAPI側で別途対策する。経緯はdocs/schema.mdの「セキュリティ実装の優先度」参照）
    res.status(409).json({ error: 'email_already_registered' })
    return
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS)

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
    },
  })

  res.status(201).json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  })
})
