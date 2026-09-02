import { Router } from 'express'
import bcrypt from 'bcrypt'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const authRouter = Router()

// bcryptのソルトラウンド数。大きいほど安全だが計算コストが上がる。12は一般的な推奨値
const BCRYPT_SALT_ROUNDS = 12

// ユーザーが存在しない場合でも応答時間を揃えるための、ログイン専用のダミーハッシュ
// （実在しないパスワードに対するハッシュ値。bcrypt.compareの処理時間を発生させるためだけに使う）
const DUMMY_PASSWORD_HASH = await bcrypt.hash(
  'dummy-password-for-timing-safety',
  BCRYPT_SALT_ROUNDS,
)

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

// ログイン試行のレート制限。総当たり攻撃対策
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分間
  limit: 10, // 同一IPから15分間に10回まで
  standardHeaders: true,
  legacyHeaders: false,
})

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

authRouter.post('/login', loginRateLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() })
    return
  }
  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })

  // メールアドレス列挙対策：ユーザーが存在しない場合も、存在する場合と同じ処理時間・
  // 同じエラー内容になるよう、ダミーハッシュとの比較を必ず行う
  const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH
  const passwordMatches = await bcrypt.compare(password, passwordHash)

  if (!user || !passwordMatches) {
    res.status(401).json({ error: 'invalid_credentials' })
    return
  }

  // セッション固定化対策：ログイン成功時にセッションIDを再生成してから、
  // 新しいセッションにuserIdを保存する
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
  req.session.userId = user.id

  res.status(200).json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } })
  if (!user) {
    // 退会等でユーザーが既に存在しない場合。念のためセッションも破棄しておく
    req.session.destroy(() => {})
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  res.status(200).json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  })
})

authRouter.post('/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'logout_failed' })
      return
    }
    res.clearCookie('connect.sid')
    res.status(204).end()
  })
})
