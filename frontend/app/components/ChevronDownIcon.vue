<!--
  開閉トグルを示すシェブロン（下向き矢印）アイコン。Heroicons（MITライセンス、outline/chevron-down）の
  SVGパスをそのまま埋め込んでいる。https://heroicons.com/ TrashIcon.vueと同じ方針（Issue #93）で、
  新しいnpm依存を増やさずファイルを足す形にしている（Issue #97、④「もっと見る」の開閉ボタンで使用）。
  色はstroke="currentColor"なので、呼び出し側でtext-*クラスを当てれば変わる。開閉状態はCSSの
  回転（transform）で呼び出し側から制御する。
-->
<script setup lang="ts">
withDefaults(defineProps<{ class?: string }>(), { class: 'h-4 w-4' })
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" :class="class">
    <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
</template>
