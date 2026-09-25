<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'xs'
    center?: boolean
    subtle?: boolean
  }>(),
  { size: 'sm', center: false, subtle: false },
)
</script>

<template>
  <p
    :class="[
      size === 'xs' ? 'text-xs' : 'text-sm',
      center ? 'text-center' : '',
      subtle ? 'text-gray-400' : 'text-gray-500',
      'dark:text-muted',
    ]"
  >
    <slot>読み込み中...</slot>
  </p>
</template>
