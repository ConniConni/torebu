import 'dotenv/config'
import express from 'express'
import { sessionMiddleware } from './session.js'

export const app = express()

app.use(sessionMiddleware)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const port = process.env.PORT ?? 3001

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`backend server listening on port ${port}`)
  })
}
