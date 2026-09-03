import 'dotenv/config'
import express from 'express'
import { sessionMiddleware } from './session.js'
import { authRouter } from './routes/auth.js'
import { exercisesRouter } from './routes/exercises.js'

export const app = express()

app.use(express.json())
app.use(sessionMiddleware)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/auth', authRouter)
app.use('/exercises', exercisesRouter)

const port = process.env.PORT ?? 3001

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`backend server listening on port ${port}`)
  })
}
