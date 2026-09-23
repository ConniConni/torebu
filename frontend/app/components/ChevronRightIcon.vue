<!--
  行の遷移可能を示す右向きシェブロンアイコン。Heroicons（MITライセンス、outline/chevron-right）の
  SVGパスをそのまま埋め込んでいる。https://heroicons.com/ ChevronDownIcon.vueと同じ方針（Issue #93）。
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{ class?: string }>(), { class: 'h-4 w-4' })
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="1.5"
    stroke="currentColor"
    :class="props.class"
  >
    <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
</template>
