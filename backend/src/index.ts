import 'dotenv/config'
import express from 'express'
import { sessionMiddleware } from './session.js'
import { authRouter } from './routes/auth.js'
import { exercisesRouter } from './routes/exercises.js'
import { workoutsRouter } from './routes/workouts.js'
import { routinesRouter } from './routes/routines.js'
import { statsRouter } from './routes/stats.js'
import { groupsRouter } from './routes/groups.js'
import { notificationsRouter } from './routes/notifications.js'
import { adminRouter } from './routes/admin.js'
import { initSentry, sentryErrorHandler } from './sentry.js'

// SENTRY_DSNが設定された環境（本番・Preview）だけでエラー監視を有効にする（Issue #403）
initSentry()

export const app = express()

// Vercelのプロキシ配下で動くため必須（X-Forwarded-*ヘッダーを信頼し、
// req.secure・req.ipやセッションCookieのsecure判定を正しく行えるようにする）
app.set('trust proxy', 1)

app.use(express.json())
app.use(sessionMiddleware)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/auth', authRouter)
app.use('/exercises', exercisesRouter)
app.use('/workouts', workoutsRouter)
app.use('/routines', routinesRouter)
app.use('/stats', statsRouter)
app.use('/groups', groupsRouter)
app.use('/notifications', notificationsRouter)
app.use('/admin', adminRouter)

// Sentryに実際にエラーが届くか（個人情報が伏せられているか）を確かめるための確認用ルート。
// Preview環境でだけ有効にする（本番・ローカル・テストでは404）。ボディやメッセージにわざと
// メールアドレス等を含め、Sentry側に届いたイベントで消えていることを確認する（Issue #403）
if (process.env.VERCEL_ENV === 'preview') {
  app.post('/debug/sentry-error', () => {
    throw new Error('Sentry動作確認用のエラー（preview-check@example.com）')
  })
}

// ルートより後ろに置く（Expressのエラーハンドラは登録順に呼ばれる）
app.use(sentryErrorHandler)

const port = process.env.PORT ?? 3001

// Vercel環境ではサーバーレス関数（api/index.ts）がappをそのままexportして使うため、
// ここでlistenしない（listenするとデプロイ時にエラーになる）
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`backend server listening on port ${port}`)
  })
}
