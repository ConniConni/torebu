<!--
  期間別サマリーカードの動物換算キャプション（Issue #169、frontend/app/utils/weightDisplay.ts参照）に
  添える、海の生き物のイラスト。自作の単色SVGシルエットは「綺麗だけど何の生き物か分からない」という
  指摘を受け、用意されたPNG画像を表示するだけのシンプルな構成に変更した（2026-09-11）。
  画像は`frontend/public/images/animals/`に置き、ビルド時ではなく実行時にパス解決される
  publicアセットとして参照する（`~/assets/`配下のビルド時import と違い、画像ファイルが
  無くてもdevサーバーやビルド自体は落ちない。単に画像が表示されないだけになる）。
  altは呼び出し側から動物名（weightDisplay.tsのanimalCaption().animalName）を渡す。
  以前は空alt+aria-hiddenの装飾画像扱いだったが、隣接テキストから動物名を省いた（「×0.8相当の
  負荷重量」に変更、2026-09-11）ことで動物名の情報がこのイラストだけになったため、
  スクリーンリーダーでも動物名が伝わるようaltを必須にした
-->
<script setup lang="ts">
import type { SeaAnimal } from '~/utils/weightDisplay'

const props = withDefaults(defineProps<{ name: SeaAnimal['key']; alt: string; class?: string }>(), {
  class: 'h-6 w-9',
})

// public/images/animals/配下のファイル名と対応させる
const IMAGE_PATHS: Record<SeaAnimal['key'], string> = {
  manbou: '/images/animals/manbou.png',
  orca: '/images/animals/orca.png',
  whale: '/images/animals/whale.png',
}
</script>

<template>
  <img :src="IMAGE_PATHS[props.name]" :alt="props.alt" :class="[props.class, 'object-contain']" />
</template>

<style scoped>
/* PNGが黒一色のため、ブランドカラー(--color-brand-700 #b8431a)に寄せるCSSフィルター。
   hue-rotate等は純粋な黒には効かない(黒は色相を持たない)ため、まずinvertで暗いグレーに
   起こしてからsepia/saturate/hue-rotateで色付けしている。数値は「元画像の黒ピクセルを
   canvasに読み込み、フィルター適用後の色と#b8431aの距離をJSで総当たり比較する」方法で
   決めた（人力の色合わせではなく実測、2026-09-11）。フィルターでは完全に同じ色にはならない
   近似値だが、実測でのズレは数値程度（RGB距離6前後）で視覚的にはほぼ一致する */
img {
  filter: invert(28%) sepia(90%) saturate(1100%) hue-rotate(348deg) brightness(95%) contrast(90%);
}
</style>
