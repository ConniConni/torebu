import { mainMuscleToSlug, relatedMuscleToSlugZone, type MuscleZone } from '~/utils/muscleSlugs'
import { computeHighlightMaps, type HighlightExercise, type SideMaps } from '~/utils/muscleHighlightSvg'

export interface HighlightSource {
  mainMuscle: string | null
  relatedMuscles: string[]
  mainZone: string | null
}

export interface MuscleHighlightResult {
  // mainMuscleが無い(カスタム種目)か、対応表に無い想定外の値の場合はfalse
  // (④画面側で「部位ハイライトのデータがありません」表示に使う)
  hasHighlightData: boolean
  front: SideMaps
  back: SideMaps
}

const EMPTY_SIDE: SideMaps = { intensityMap: {}, zoneSpecs: [], labelMap: {}, active: false }

// exercises APIのmainMuscle/relatedMuscles/mainZone(日本語文字列)から、
// 前面/背面それぞれの発光・ラベル指定を計算する。
// showRelatedがfalseなら関連筋を含めない(主働筋のみ表示)
export function useMuscleHighlight(source: HighlightSource, showRelated: boolean): MuscleHighlightResult {
  if (!source.mainMuscle) {
    return { hasHighlightData: false, front: EMPTY_SIDE, back: EMPTY_SIDE }
  }
  const mainSlug = mainMuscleToSlug(source.mainMuscle)
  if (!mainSlug) {
    return { hasHighlightData: false, front: EMPTY_SIDE, back: EMPTY_SIDE }
  }

  const related = source.relatedMuscles
    .map((ja) => {
      const slugZone = relatedMuscleToSlugZone(ja)
      return slugZone ? { ...slugZone, ja } : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const highlightExercise: HighlightExercise = {
    mainSlug,
    mainZone: (source.mainZone as MuscleZone | null) ?? null,
    mainMuscleJa: source.mainMuscle,
    related,
  }

  const { front, back } = computeHighlightMaps(highlightExercise, showRelated)
  return { hasHighlightData: true, front, back }
}
