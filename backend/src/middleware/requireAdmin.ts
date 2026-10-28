import type { NextFunction, Request, Response } from 'express'

/**
 * 管理者(環境変数ADMIN_USER_IDSにカンマ区切りで載っているユーザーID)かどうかを判定するミドルウェア(Issue #401)。
 * Userにroleのような列は持たせず、管理者は運営本人だけという前提で環境変数の許可リストにしている。
 * 環境変数が未設定・空なら誰も通さない。
 * 管理用のパスがあること自体を見せないよう、未ログイン・管理者以外はどちらも404を返す
 * (requireAuthを前に挟むと未ログイン時だけ401になるため、挟まない)。
 * 環境変数はリクエストごとに読む(テストで後から設定する・Vercelで値を変えた場合に反映させるため)
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const adminUserIds = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const userId = req.session.userId
  if (!userId || !adminUserIds.includes(userId)) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  next()
}
