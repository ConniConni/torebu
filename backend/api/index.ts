// Vercel Serverless Functionのエントリーポイント。
// vercel.jsonのrewritesで全パスをここに集約し、Express（app）自体のルーティングに委ねる。
// Expressアプリはリクエストハンドラ関数（req, res） => void と同じシグネチャのため、
// そのままdefault exportすればVercelのNode.jsランタイムがハンドラとして扱える。
import { app } from '../src/index.js'

export default app
