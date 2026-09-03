import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import pg from 'pg'

declare module 'express-session' {
  interface SessionData {
    userId: string
  }
}

// セッションの実体（sid/sess/expire）はこのプールで直接管理する。
// Prismaのマイグレーション管理外（経緯はdocs/schema.mdの「設計方針メモ」参照）
const sessionPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})

const sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret) {
  throw new Error('SESSION_SECRET is not set')
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

const PgSession = connectPgSimple(session)

export const sessionMiddleware = session({
  store: new PgSession({
    pool: sessionPool,
    // テーブルが無ければ初回接続時に自動作成する（sid/sess/expire構成）
    createTableIfMissing: true,
  }),
  secret: sessionSecret,
  resave: false, // セッションに変更が無いリクエストでは再保存しない
  saveUninitialized: false, // 未ログインの空セッションはDBに保存しない
  cookie: {
    httpOnly: true, // JSからCookieを読めないようにする(XSS対策)
    secure: process.env.NODE_ENV === 'production', // 本番はHTTPS前提のためtrue、ローカル開発はhttpなのでfalse
    sameSite: 'lax', // 他サイトからの不正リクエストを防ぐ(CSRF対策の一部)
    maxAge: FOURTEEN_DAYS_MS,
  },
})
