import type { NextFunction, Request, Response } from 'express'

/**
 * ログイン中(session.userIdがある)かどうかを判定する共通ミドルウェア。
 * 未ログインなら401を返し、以降の処理には進ませない。
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  next()
}
