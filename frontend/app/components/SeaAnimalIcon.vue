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

// PNGが黒一色のため、CSSフィルターで着色している（下記style参照）。ライト/ダークで色を
// 出し分ける必要があるが、`<style scoped>`の`[data-theme="dark"]`祖先セレクタ+`:global()`は
// Vueのscoped CSSコンパイルでスコープが想定通りに効かず、filterがimg要素ではなく
// ページ全体に適用されてしまう不具合が実機確認で見つかった（Issue #241フォローアップ）。
// CSSだけで出し分けるのを諦め、useThemeのtheme（'light'|'dark'）を見てJS側でfilterの値
// そのものを切り替える方式にした
const { theme } = useTheme()
const FILTERS: Record<'light' | 'dark', string> = {
  // ブランドカラー(--color-brand-700 #b8431a)に寄せる値。「元画像の黒ピクセルをcanvasに
  // 読み込み、フィルター適用後の色との距離を総当たり比較する」方法で決めた（2026-09-11）
  light: 'invert(28%) sepia(90%) saturate(1100%) hue-rotate(348deg) brightness(95%) contrast(90%)',
  // ダークのアクセント色--color-accent(#c8ff4d)に寄せる値。同じ総当たり方式で求めた
  // （実測誤差はRGB距離ほぼ0）
  dark: 'invert(86%) sepia(30%) saturate(900%) hue-rotate(27deg) brightness(110%) contrast(100%)',
}
</script>

<template>
  <img
    :src="IMAGE_PATHS[props.name]"
    :alt="props.alt"
    :class="[props.class, 'object-contain']"
    :style="{ filter: FILTERS[theme] }"
  />
</template>
