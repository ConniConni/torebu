// ②ホームの期間別サマリーカード（今週/今月/通算、Issue #169）で使う重量表示のヘルパー。
//
// 合計負荷重量は当初kg表示だったが、「0.8t」のようなt（トン）表記の方が桁が減ってすっきりする
// という判断で切り替えた（2026-09-10）。あわせて、t表記にしても数字だけだと実感が湧きにくい
// という指摘を受け、海の生き物の体重に例える「動物換算」のキャプションを添えている
// （モックで陸・海の動物を比較した結果、海の生き物だけに絞る方針にした）。

// kgをt表記の文字列に変換する（小数第1位まで）。0kgは「0t」（小数点無し）にして、
// 「記録が無い」ことがひと目で分かるようにする
export function formatTons(kg: number): string {
  if (kg <= 0) return '0t'
  return `${(kg / 1000).toFixed(1)}t`
}

export interface SeaAnimal {
  key: 'manbou' | 'orca' | 'whale'
  name: string
  tons: number // 参考体重（種・個体差があるサンプル値）
}

// 体重のケタが異なる3種を採用（1t・5.5t・110t前後）。SeaAnimalIcon.vueと対応させる。
// 中間の種はサメ（ジンベエザメ、約9t）だったが、絵柄が伝わりにくいという指摘を受けて
// シャチ（約5.5t、成体オスの目安）に変更した（2026-09-11）
export const SEA_ANIMALS: SeaAnimal[] = [
  { key: 'manbou', name: 'マンボウ', tons: 1 },
  { key: 'orca', name: 'シャチ', tons: 5.5 },
  { key: 'whale', name: 'クジラ', tons: 110 },
]

// tons(合計負荷重量のトン数)を基準に、動物を切り替える。
// 「その動物の体重の1倍(×1)以上になったら次の動物に切り替える」というルールで、
// 体重が一番近い動物を選ぶ（対数距離）方式から変更した（2026-09-11）。
// 対数距離だと「シロナガスクジラの0.8頭分」のように、まだ1頭分に満たない状態で
// より大きい動物に切り替わってしまい、「×1」に満たない数字が出る違和感があったため
export function pickSeaAnimal(tons: number): SeaAnimal {
  const ascending = [...SEA_ANIMALS].sort((a, b) => a.tons - b.tons)
  let chosen = ascending[0]!
  for (const animal of ascending) {
    if (tons / animal.tons >= 1) chosen = animal
  }
  return chosen
}

export interface AnimalCaption {
  animalKey: SeaAnimal['key']
  text: string // 例:「シャチ×1.4」
}

// 合計負荷重量(kg)から動物換算のキャプションを作る。0kg以下（記録が無い）はキャプション自体を
// 出さない（「マンボウ×0」等は意味を持たないため）。
// 表記は「約◯匹(頭)分」から「×◯」に短縮した（2026-09-11、アイコンを大きく見せるスペース確保のため）
export function animalCaption(kg: number): AnimalCaption | null {
  if (kg <= 0) return null
  const tons = kg / 1000
  const animal = pickSeaAnimal(tons)
  const count = Math.round((tons / animal.tons) * 10) / 10 // 小数第1位で四捨五入
  return { animalKey: animal.key, text: `${animal.name}×${count}` }
}
