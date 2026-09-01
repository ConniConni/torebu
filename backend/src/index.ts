import 'dotenv/config'
import express from 'express'

export const app = express()

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const port = process.env.PORT ?? 3001

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`backend server listening on port ${port}`)
  })
}
