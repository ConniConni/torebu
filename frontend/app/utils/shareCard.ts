// 自分の記録の画像カードシェア（Issue #314）のうち、カードに載せる内容を組み立てる純粋関数。
// Canvasへの描画はshareCardCanvas.tsで行う（描画はテストしにくいため、内容の決定だけここに分けた）。
//
// 載せないもの（docs/backlog.md「ユーザー獲得：自分の記録の画像カードシェア」の方針）：
// 表示名・メモ・仲間のいいね/コメント・招待リンク。外部SNSに出る画像のため、本人の記録の数字だけにする

export interface ShareCardSetInput {
  weightKg: number | null
  reps: number
}

export interface ShareCardExerciseInput {
  name: string
  sets: ShareCardSetInput[]
}

export interface ShareCardExercise {
  name: string
  // その種目のトップセット。例:「60kg × 10回」「自重 × 15回」
  topSetText: string
  setCount: number
}

export interface ShareCardData {
  dateLabel: string // 例:「2026.10.03 (土)」
  totalVolumeKg: number // Σ weightKg × reps（自重セットは除外。GET /stats/volumeと同じ定義）
  exerciseCount: number
  setCount: number
  dayNumber: number // 通算何日目のトレーニングか（セットがある日だけ数える。trainingDays.tsと同じ定義）
  exercises: ShareCardExercise[] // 先頭からMAX_CARD_EXERCISES件まで
  hiddenExerciseCount: number // 画像に収まらず省略した種目数
}

// 1080×1350の画像に無理なく収まる種目数。超えた分は「ほか◯種目」とする
export const MAX_CARD_EXERCISES = 6

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function formatShareCardDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${date.replaceAll('-', '.')} (${weekday})`
}

// トップセット：重量が一番重いセット（同重量なら回数が多い方）。重量のあるセットが1つも無い
// （全セット自重）ときは回数が一番多いセット
export function topSetText(sets: ShareCardSetInput[]): string {
  const weighted = sets.filter((s) => s.weightKg !== null)
  if (weighted.length > 0) {
    const top = weighted.reduce((best, s) =>
      s.weightKg! > best.weightKg! || (s.weightKg === best.weightKg && s.reps > best.reps)
        ? s
        : best,
    )
    return `${top.weightKg}kg × ${top.reps}回`
  }
  const maxReps = Math.max(...sets.map((s) => s.reps))
  return `自重 × ${maxReps}回`
}

export function buildShareCardData(
  date: string,
  exercises: ShareCardExerciseInput[],
  recordedDates: string[], // セットが1件以上ある日の一覧（HomeScreen.vueのallRecordedDates）
): ShareCardData {
  const withSets = exercises.filter((e) => e.sets.length > 0)
  const totalVolumeKg = withSets
    .flatMap((e) => e.sets)
    .reduce((sum, s) => sum + (s.weightKg === null ? 0 : s.weightKg * s.reps), 0)
  const dayNumber = new Set(recordedDates.filter((d) => d <= date)).size

  return {
    dateLabel: formatShareCardDate(date),
    totalVolumeKg,
    exerciseCount: withSets.length,
    setCount: withSets.reduce((sum, e) => sum + e.sets.length, 0),
    dayNumber,
    exercises: withSets.slice(0, MAX_CARD_EXERCISES).map((e) => ({
      name: e.name,
      topSetText: topSetText(e.sets),
      setCount: e.sets.length,
    })),
    hiddenExerciseCount: Math.max(0, withSets.length - MAX_CARD_EXERCISES),
  }
}

export const SHARE_SIGNUP_REF = 'share'

// 共有本文に付けるURL。新規の流入口はトップ（未ログイン向けのサービス紹介ページ）にする。
// 招待リンクは不特定多数がクローズドなグループに入れてしまうため載せない。
// ?ref=shareは、シェア経由の登録を後から確かめるための目印（signupRef.ts参照）
export function shareLandingUrl(origin: string): string {
  return new URL(`/?ref=${SHARE_SIGNUP_REF}`, origin).href
}

// 過去日の記録もシェアできるため「今日」などの日付に依存する言い回しは避ける
export function shareText(data: ShareCardData): string {
  return `トレーニングを記録しました💪 通算${data.dayNumber}日目 #トレ部`
}
