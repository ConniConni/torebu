// 自分の記録の画像カードシェア（Issue #314）のうち、カードに載せる内容を組み立てる純粋関数。
// Canvasへの描画はshareCardCanvas.tsで行う（描画はテストしにくいため、内容の決定だけここに分けた）。
//
// 載せないもの（docs/backlog.md「ユーザー獲得：自分の記録の画像カードシェア」の方針）：
// 表示名・メモ・仲間のいいね/コメント・招待リンク。外部SNSに出る画像のため、本人の記録の数字だけにする

import {
  formatCardioSet,
  formatDistance,
  formatDuration,
  sumDistanceKm,
  sumDurationSec,
  type SpeedUnit,
} from './cardio'
import { sumSetVolumeKg } from './trainingVolume'

export interface ShareCardSetInput {
  weightKg: number | null
  reps: number | null // 有酸素（Issue #345）の行ではnull
  distanceKm?: number | null
  durationSec?: number | null
}

export interface ShareCardExerciseInput {
  name: string
  sets: ShareCardSetInput[]
  cardio?: { speedUnit: SpeedUnit | null } | null // 有酸素の種目のときだけ入る
}

export interface ShareCardExercise {
  name: string
  // その種目の全セットの内訳。例:「60kg × 10・8・6回」「40kg × 10回 / 45kg × 8回」
  setsText: string
  setCount: number
  // 右端に出すラベル。省略時は「◯セット」。有酸素の行だけ「◯件」を入れる（Issue #345）
  countLabel?: string
}

// サマリーパネルの1マス。xはパネル幅に対する左端の位置（0〜1）で、値の幅に合わせて組み合わせごとに変える
export interface ShareCardSummaryColumn {
  label: string
  value: string
  unit: string
  x: number
}

export interface ShareCardData {
  dateLabel: string // 例:「2026.10.03 (土)」
  totalVolumeKg: number // Σ weightKg × reps（自重セットは除外。GET /stats/volumeと同じ定義）
  exerciseCount: number
  setCount: number // 筋トレのセット数のみ（有酸素は数えない。Issue #345）
  summaryColumns: ShareCardSummaryColumn[]
  dayNumber: number // 通算何日目のトレーニングか（セットがある日だけ数える。trainingDays.tsと同じ定義）
  exercises: ShareCardExercise[] // 先頭からMAX_CARD_EXERCISES件まで
  hiddenExerciseCount: number // 画像に収まらず省略した種目数
}

// 1080×1350の画像に無理なく収まる種目数（1種目＝種目名とセット内訳の2行）。超えた分は「ほか◯種目」とする
export const MAX_CARD_EXERCISES = 5

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function formatShareCardDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${date.replaceAll('-', '.')} (${weekday})`
}

// 全セットの内訳を1行にまとめる。当初は最大重量のセット1つ＋「◯セット」だけを載せていたが、
// 他のセットも同じ重量・回数だったように見えてしまうという指摘を受け、全セットを載せる形にした
// （2026-10-03）。連続する同じ重量のセットは回数だけを「・」で並べて短くする
// （例：60kg×10, 60kg×8, 70kg×5 →「60kg × 10・8回 / 70kg × 5回」）。セット順は呼び出し側で並べておく
export function formatSetsText(sets: ShareCardSetInput[]): string {
  const runs: { weightKg: number | null; reps: number[] }[] = []
  for (const set of sets) {
    if (set.reps === null) continue
    const last = runs[runs.length - 1]
    if (last && last.weightKg === set.weightKg) last.reps.push(set.reps)
    else runs.push({ weightKg: set.weightKg, reps: [set.reps] })
  }
  return runs
    .map(
      (run) => `${run.weightKg === null ? '自重' : `${run.weightKg}kg`} × ${run.reps.join('・')}回`,
    )
    .join(' / ')
}

// サマリーパネルのマスを組み立てる。筋トレだけの日は従来どおり（合計負荷重量・種目・セット）。
// 有酸素もある日は種目の代わりに距離（無ければ合計時間）を入れ、有酸素だけの日は距離（または合計時間）と
// 種目にする。有酸素だけの日に「0kg」を出さないため（Issue #345）
function buildSummaryColumns(
  exercises: ShareCardExerciseInput[],
  totalVolumeKg: number,
  setCount: number,
): ShareCardSummaryColumn[] {
  const cardioSets = exercises.filter((e) => e.cardio).flatMap((e) => e.sets)
  const distance = sumDistanceKm(cardioSets.map((s) => ({ distanceKm: s.distanceKm ?? null })))
  const duration = sumDurationSec(cardioSets.map((s) => ({ durationSec: s.durationSec ?? null })))
  const cardioColumn =
    distance > 0
      ? { label: '距離', value: String(Number(distance.toFixed(2))), unit: 'km' }
      : duration > 0
        ? { label: '合計時間', value: formatDuration(duration), unit: '' }
        : null

  const volume = {
    label: '合計負荷重量',
    value: Math.round(totalVolumeKg).toLocaleString('ja-JP'),
    unit: 'kg',
  }
  const exerciseCount = { label: '種目', value: String(exercises.length), unit: '' }
  const sets = { label: 'セット', value: String(setCount), unit: '' }
  const hasStrength = exercises.some((e) => !e.cardio)

  if (cardioColumn && hasStrength) {
    return [
      { ...volume, x: 0 },
      { ...sets, x: 0.45 },
      { ...cardioColumn, x: 0.68 },
    ]
  }
  if (cardioColumn) {
    return [
      { ...cardioColumn, x: 0 },
      { ...exerciseCount, x: 0.55 },
    ]
  }
  if (!hasStrength) return [{ ...exerciseCount, x: 0 }]
  return [
    { ...volume, x: 0 },
    { ...exerciseCount, x: 0.55 },
    { ...sets, x: 0.78 },
  ]
}

export function buildShareCardData(
  date: string,
  exercises: ShareCardExerciseInput[],
  recordedDates: string[], // セットが1件以上ある日の一覧（HomeScreen.vueのallRecordedDates）
): ShareCardData {
  const withSets = exercises.filter((e) => e.sets.length > 0)
  const strengthSets = withSets.filter((e) => !e.cardio).flatMap((e) => e.sets)
  const totalVolumeKg = sumSetVolumeKg(strengthSets)
  const setCount = strengthSets.length
  const dayNumber = new Set(recordedDates.filter((d) => d <= date)).size

  return {
    dateLabel: formatShareCardDate(date),
    totalVolumeKg,
    exerciseCount: withSets.length,
    setCount,
    summaryColumns: buildSummaryColumns(withSets, totalVolumeKg, setCount),
    dayNumber,
    exercises: withSets.slice(0, MAX_CARD_EXERCISES).map((e) =>
      e.cardio
        ? {
            name: e.name,
            setsText: e.sets
              .map((s) =>
                formatCardioSet(
                  { distanceKm: s.distanceKm ?? null, durationSec: s.durationSec ?? null },
                  e.cardio!.speedUnit,
                ),
              )
              .join(' / '),
            setCount: e.sets.length,
            countLabel: `${e.sets.length}件`,
          }
        : { name: e.name, setsText: formatSetsText(e.sets), setCount: e.sets.length },
    ),
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

// 過去日の記録もシェアできるため「今日」などの日付に依存する言い回しは避ける。
// 当初は「トレーニングを記録しました💪 通算◯日目 #トレ部」だったが、いかにも定型文で不自然という
// 指摘を受け、続けていることだけが伝わる短い形にした（2026-10-03、ユーザー判断）。
// ハッシュタグは見やすさのため改行して別の行にする（同日、ユーザー要望）。
// サービス名に加え、記録の共有・仲間との交流というトレ部の内容に合う2つを足した（同日、ユーザー判断。
// 付けすぎると宣伝っぽく見えるため合計3つまで）
const SHARE_HASHTAGS = ['#トレ部', '#筋トレ記録', '#筋トレ仲間']

export function shareText(data: ShareCardData): string {
  return `筋トレ${data.dayNumber}日目\n${SHARE_HASHTAGS.join(' ')}`
}
