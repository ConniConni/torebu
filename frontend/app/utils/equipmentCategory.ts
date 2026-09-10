// 器具絞り込み(Issue #167)。DBの`exercises.equipment`は種目マスタ元データの生の値
// (「マシン」「ケーブル」等、docs/muscle-highlight.md参照)を持っているが、絞り込みUIでは
// 「バーベル・ダンベル・自重・その他マシン」の4分類に粗く束ねて見せる方針
export const EQUIPMENT_CATEGORIES = ['barbell', 'dumbbell', 'bodyweight', 'machine'] as const

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number]

const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  barbell: 'バーベル',
  dumbbell: 'ダンベル',
  bodyweight: '自重',
  machine: 'その他・マシン',
}

export function equipmentCategoryLabel(category: EquipmentCategory): string {
  return EQUIPMENT_CATEGORY_LABELS[category]
}

// 元データの生の値 → 4分類。マシン系(マシン/ケーブル/ケトルベル/アブローラー)は「その他・マシン」に束ねる。
// 該当しない値やnull(未設定=カスタム種目)はundefinedを返す(絞り込み時は表示しない)
const RAW_EQUIPMENT_TO_CATEGORY: Record<string, EquipmentCategory> = {
  バーベル: 'barbell',
  ダンベル: 'dumbbell',
  自重: 'bodyweight',
  マシン: 'machine',
  ケーブル: 'machine',
  ケトルベル: 'machine',
  アブローラー: 'machine',
}

export function equipmentCategoryOf(equipment: string | null): EquipmentCategory | undefined {
  if (equipment === null) return undefined
  return RAW_EQUIPMENT_TO_CATEGORY[equipment]
}
