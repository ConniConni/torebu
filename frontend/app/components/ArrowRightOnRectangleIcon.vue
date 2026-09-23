<!--
  ログアウトを示す矢印アイコン。Heroicons（MITライセンス、outline/arrow-right-on-rectangle）の
  SVGパスをそのまま埋め込んでいる。https://heroicons.com/ TrashIcon.vue等と同じ方針（Issue #93）。
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{ class?: string }>(), { class: 'h-5 w-5' })
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
      d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H3"
    />
  </svg>
</template>
