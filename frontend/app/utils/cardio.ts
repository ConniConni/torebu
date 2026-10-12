// 有酸素運動（ランニング・ウォーキング・エアロバイク、Issue #345）の表示・入力まわりの純粋関数。
// 距離はkm（小数第2位まで）、時間は秒で保存し、速さは保存せず表示のたびに計算する。
// 速さの単位は種目名ではなく種目の属性（Exercise.speedUnit）で分岐する
// （ペース＝分/km：ランニング・ウォーキング、時速＝km/h：エアロバイク）

import { formatKg, sumSetVolumeKg } from './trainingVolume'

export type SpeedUnit = 'pace' | 'kmh'

// backend/src/routes/workouts.tsの検証範囲と揃える（距離は0超〜999.99、時間は1〜59999秒）
export const MAX_DISTANCE_KM = 999.99
export const MAX_DURATION_SEC = 59999

export interface CardioSetValues {
  distanceKm: number | null
  durationSec: number | null
}

// --- 入力のパース ---

export type ParseResult<T> = { ok: true; value: T } | { ok: false }

// 距離の入力欄の文字列をkmにする。空欄はnull（クリア）。0以下・範囲外・小数第3位以下は不正。
// 浮動小数点の誤差を避けるため、桁数は数値ではなく文字列の形で判定する
export function parseDistanceInput(raw: string | number): ParseResult<number | null> {
  const text = String(raw).trim()
  if (text === '') return { ok: true, value: null }
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return { ok: false }
  const value = Number(text)
  if (value <= 0 || value > MAX_DISTANCE_KM) return { ok: false }
  return { ok: true, value }
}

// 時間の「分」「秒」2つの入力欄を合わせて秒にする。両方空欄はnull（クリア）、片方だけ空欄は0扱い。
// 分は0〜999の整数、秒は0〜59の整数。合計が0秒・上限超えは不正
export function parseDurationInput(
  minutesRaw: string | number,
  secondsRaw: string | number,
): ParseResult<number | null> {
  const minutesText = String(minutesRaw).trim()
  const secondsText = String(secondsRaw).trim()
  if (minutesText === '' && secondsText === '') return { ok: true, value: null }
  if (minutesText !== '' && !/^\d{1,3}$/.test(minutesText)) return { ok: false }
  if (secondsText !== '' && !/^\d{1,2}$/.test(secondsText)) return { ok: false }
  const minutes = minutesText === '' ? 0 : Number(minutesText)
  const seconds = secondsText === '' ? 0 : Number(secondsText)
  if (seconds > 59) return { ok: false }
  const total = minutes * 60 + seconds
  if (total < 1 || total > MAX_DURATION_SEC) return { ok: false }
  return { ok: true, value: total }
}

// 保存済みの秒を「分」「秒」の入力欄の初期値に分ける（nullは両方空欄）
export function splitDuration(durationSec: number | null): { minutes: string; seconds: string } {
  if (durationSec === null) return { minutes: '', seconds: '' }
  return {
    minutes: String(Math.floor(durationSec / 60)),
    seconds: String(durationSec % 60),
  }
}

// --- 表示 ---

// 「分:秒」。60分を超えても時間にはせず分のまま（例: 90:05）。入力欄が分・秒なので揃えている
export function formatDuration(durationSec: number): string {
  const minutes = Math.floor(durationSec / 60)
  const seconds = durationSec % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// 例: 5 → 「5km」、5.25 → 「5.25km」、10.5 → 「10.5km」
export function formatDistance(distanceKm: number): string {
  return `${Number(distanceKm.toFixed(2))}km`
}

// ペース（分/km）。距離・時間がそろっているときだけ。秒は四捨五入（59.5秒以上は繰り上げ）
export function paceSecPerKm(distanceKm: number, durationSec: number): number {
  return Math.round(durationSec / distanceKm)
}

export function formatPace(distanceKm: number, durationSec: number): string {
  return `${formatDuration(paceSecPerKm(distanceKm, durationSec))}/km`
}

// 時速（km/h）。小数第1位まで
export function formatSpeedKmh(distanceKm: number, durationSec: number): string {
  return `${((distanceKm / durationSec) * 3600).toFixed(1)}km/h`
}

// 速さの表示。距離・時間のどちらかが欠けている、または単位が不明（null）のときはnull
export function formatSpeed(
  set: CardioSetValues,
  speedUnit: SpeedUnit | null | undefined,
): string | null {
  if (set.distanceKm === null || set.durationSec === null || !speedUnit) return null
  return speedUnit === 'kmh'
    ? formatSpeedKmh(set.distanceKm, set.durationSec)
    : formatPace(set.distanceKm, set.durationSec)
}

// 速さ列の見出し
export function speedLabel(speedUnit: SpeedUnit | null | undefined): string {
  return speedUnit === 'kmh' ? '時速' : 'ペース'
}

// 1セットの要約。入っている項目だけを「・」でつなぐ。例:「5km・30:00・6:00/km」「5km」「30:00」
// 何も入っていなければ「未入力」
export function formatCardioSet(
  set: CardioSetValues,
  speedUnit: SpeedUnit | null | undefined,
): string {
  const parts: string[] = []
  if (set.distanceKm !== null) parts.push(formatDistance(set.distanceKm))
  if (set.durationSec !== null) parts.push(formatDuration(set.durationSec))
  const speed = formatSpeed(set, speedUnit)
  if (speed) parts.push(speed)
  return parts.length > 0 ? parts.join('・') : '未入力'
}

// --- 集計 ---

// 距離の合計。小数の足し算の誤差を避けるため、100倍の整数にして足してから戻す
export function sumDistanceKm(sets: { distanceKm: number | null }[]): number {
  const hundredths = sets.reduce((sum, s) => sum + Math.round((s.distanceKm ?? 0) * 100), 0)
  return hundredths / 100
}

export function sumDurationSec(sets: { durationSec: number | null }[]): number {
  return sets.reduce((sum, s) => sum + (s.durationSec ?? 0), 0)
}

// 種目の見出し用の合計。「距離（無ければ時間）」。どちらも無ければnull
export function formatCardioTotal(sets: CardioSetValues[]): string | null {
  const distance = sumDistanceKm(sets)
  if (distance > 0) return formatDistance(distance)
  const duration = sumDurationSec(sets)
  if (duration > 0) return formatDuration(duration)
  return null
}

// --- ③記録画面の上部サマリー ---

export interface DaySummarySet {
  isCardio: boolean
  weightKg: number | null
  reps: number | null
  distanceKm: number | null
  durationSec: number | null
}

export interface DaySummaryCell {
  key: 'volume' | 'sets' | 'distance' | 'duration'
  label: string
  value: string // 単位込みの表示文字列（例:「1,080kg」「12セット」「5.2km」「30:00」）
}

// 筋トレもある日は3マス（合計負荷重量・セット数・距離）、筋トレだけの日は従来どおり2マス、
// 有酸素だけの日は距離のみ（距離が無ければ合計時間）。セット数は筋トレのみ数える。
// セットが1件も無い日、有酸素だけで距離も時間も無い日は空配列（サマリー自体を出さない）
export function buildDaySummaryCells(sets: DaySummarySet[]): DaySummaryCell[] {
  const strength = sets.filter((s) => !s.isCardio)
  const cardio = sets.filter((s) => s.isCardio)
  const distance = sumDistanceKm(cardio)
  const duration = sumDurationSec(cardio)

  const distanceCell: DaySummaryCell = {
    key: 'distance',
    label: '距離',
    value: formatDistance(distance),
  }
  const durationCell: DaySummaryCell = {
    key: 'duration',
    label: '合計時間',
    value: formatDuration(duration),
  }

  if (strength.length === 0) {
    if (distance > 0) return [distanceCell]
    if (duration > 0) return [durationCell]
    return []
  }

  const cells: DaySummaryCell[] = [
    {
      key: 'volume',
      label: '合計負荷重量',
      value: formatKg(sumSetVolumeKg(strength)),
    },
    { key: 'sets', label: 'セット数', value: `${strength.length}セット` },
  ]
  if (cardio.length > 0) {
    if (distance > 0 || duration === 0) cells.push(distanceCell)
    else cells.push(durationCell)
  }
  return cells
}
