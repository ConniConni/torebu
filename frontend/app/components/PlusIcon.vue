<!--
  FAB「＋記録」のアイコン。Heroicons（MITライセンス、outline/plus）のSVGパスをそのまま埋め込んでいる。
  https://heroicons.com/ BellIcon.vue等と同じ方針（Issue #174、下部タブバー）。
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{ class?: string }>(), { class: 'h-6 w-6' })
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="2"
    stroke="currentColor"
    :class="props.class"
  >
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
</template>
