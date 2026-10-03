<!--
  共有操作を示すアイコン。Heroicons（MITライセンス、outline/arrow-up-on-square）のSVGパスをそのまま埋め込んでいる。
  https://heroicons.com/ TrashIcon.vue等と同じ方針（Issue #93）。②ホームの記録の画像カードシェア（Issue #314）で使う
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
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15"
    />
  </svg>
</template>
