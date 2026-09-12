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

const port = process.env.PORT ?? 3001

// Vercel環境ではサーバーレス関数（api/index.ts）がappをそのままexportして使うため、
// ここでlistenしない（listenするとデプロイ時にエラーになる）
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`backend server listening on port ${port}`)
  })
}
