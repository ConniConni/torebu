<!--
  通知を示すベルアイコン。Heroicons（MITライセンス、outline/bell）のSVGパスをそのまま埋め込んでいる。
  https://heroicons.com/ HeartIcon.vue・CommentIcon.vue等と同じ方針で新しいnpm依存を増やさず
  ファイルを足している（Issue #93参照）。色はstroke="currentColor"なので、呼び出し側でtext-*クラスを当てれば変わる。
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
      d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
    />
  </svg>
</template>
