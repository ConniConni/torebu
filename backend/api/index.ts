// Vercel Serverless Functionのエントリーポイント。
// vercel.jsonのrewritesで全パスをここに集約し、Express（app）自体のルーティングに委ねる。
// Expressアプリはリクエストハンドラ関数（req, res） => void と同じシグネチャのため、
// そのままdefault exportすればVercelのNode.jsランタイムがハンドラとして扱える。
import { app } from '../src/index.js'

export default app

// コールドスタート（関数の起動）ごとに1回だけ、実際に動いているNodeのバージョンをVercelのログに残す。
// Nodeのセキュリティリリース時に、本番がパッチ済みの版で動いているかをここで確認する
// （docs/git-workflow.md「Node.jsのバージョンとセキュリティリリース」）。
console.log(`[runtime] Node.js ${process.version}`)
