<!--
  いいねを示すハートアイコン。Heroicons（MITライセンス、outline/heart・solid/heart）のSVGパスをそのまま埋め込んでいる。
  https://heroicons.com/ 新しいnpm依存を増やさず、TrashIcon.vue等と同じ方針でファイルを足している（Issue #93参照）。
  `filled`でoutline/solidを切り替える（いいね済みかどうかの表現用）。色はcurrentColorなので、
  呼び出し側でtext-*クラスを当てれば変わる。
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{ class?: string; filled?: boolean }>(), {
  class: 'h-4 w-4',
  filled: false,
})
</script>

<template>
  <svg
    v-if="props.filled"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    :class="props.class"
  >
    <path
      d="M11.645 20.91a.75.75 0 0 0 .71 0c.201-.11 4.879-2.687 7.267-6.36 1.147-1.667 1.878-3.407 1.878-5.169 0-2.822-2.226-5.13-5.03-5.13-1.869 0-3.454.994-4.47 2.588-1.016-1.594-2.601-2.589-4.47-2.589-2.804 0-5.03 2.309-5.03 5.13 0 1.763.732 3.503 1.878 5.17 2.388 3.673 7.065 6.25 7.267 6.36Z"
    />
  </svg>
  <svg
    v-else
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
      d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
    />
  </svg>
</template>
