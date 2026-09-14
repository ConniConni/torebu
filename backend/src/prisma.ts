import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.js'

// session.tsのsessionPoolと同じ理由（Vercelのサーバーレス関数は複数インスタンスが
// 同時に起動しうるため、インスタンスごとのプールのmaxを絞る。本番はNeonのプール接続
// エンドポイント（PgBouncer経由）を使う前提）でmaxを小さくする
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 })

export const prisma = new PrismaClient({ adapter })
