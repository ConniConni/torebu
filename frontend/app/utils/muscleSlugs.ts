// exercises.mainMuscle/relatedMuscles（日本語文字列、docs/muscle-highlight.md参照）を
// react-native-body-highlighter由来のSVGスラッグ（muscle-body-svg.json内のslug）に変換する対応表。
//
// 「広背筋」「上背部」はSVGライブラリ上どちらも upper-back スラッグしか無いため同じslugになる
// （lats非対応、恒久的な技術的制約。docs/muscle-highlight.mdの「技術的制約」参照）。
// 区別は main_zone（lat/upper_back）側で行う。

export type MuscleZone =
  | 'upper'
  | 'mid'
  | 'lower'
  | 'front'
  | 'lateral'
  | 'back'
  | 'lat'
  | 'upper_back'

// main_muscle（15語彙）→ スラッグ
const MAIN_MUSCLE_TO_SLUG: Record<string, string> = {
  大胸筋: 'chest',
  三角筋: 'deltoids',
  上背部: 'upper-back',
  広背筋: 'upper-back',
  脊柱起立筋: 'lower-back',
  僧帽筋: 'trapezius',
  上腕二頭筋: 'biceps',
  上腕三頭筋: 'triceps',
  大腿四頭筋: 'quadriceps',
  ハムストリング: 'hamstring',
  ふくらはぎ: 'calves',
  内転筋群: 'adductors',
  臀筋群: 'gluteal',
  腹直筋: 'abs',
  腹斜筋: 'obliques',
}

// related_muscles側にだけ現れる、部位限定っぽい表記（decision_log.md 100節「表記ゆれ」参照）。
// main_muscleの語彙に無い名前・zone付きの名前をここで個別に対応させる
const RELATED_MUSCLE_OVERRIDES: Record<string, { slug: string; zone?: MuscleZone }> = {
  三角筋前部: { slug: 'deltoids', zone: 'front' },
  三角筋後部: { slug: 'deltoids', zone: 'back' },
  '胸上部（大胸筋上部）': { slug: 'chest', zone: 'upper' },
  '胸（中部）': { slug: 'chest', zone: 'mid' },
  前腕: { slug: 'forearm' },
}

export interface SlugZone {
  slug: string
  zone?: MuscleZone
}

// 主働筋名 → スラッグ。対応表に無い名前（想定外データ）はnullを返し、呼び出し側で「データなし」扱いにする
export function mainMuscleToSlug(mainMuscle: string): string | null {
  return MAIN_MUSCLE_TO_SLUG[mainMuscle] ?? null
}

// 関連筋名 → スラッグ・ゾーン
export function relatedMuscleToSlugZone(relatedMuscle: string): SlugZone | null {
  const override = RELATED_MUSCLE_OVERRIDES[relatedMuscle]
  if (override) return override
  const slug = MAIN_MUSCLE_TO_SLUG[relatedMuscle]
  return slug ? { slug } : null
}
