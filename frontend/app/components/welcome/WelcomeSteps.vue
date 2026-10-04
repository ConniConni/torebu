<!-- 特設ページ「使い方3ステップ」（Issue #332） -->
<script setup lang="ts">
const steps = ['登録する', 'グループを作る（または招待リンクで参加）', '記録して、応援しあう']
</script>

<template>
  <section class="border-t border-brand-100 px-6 py-10 dark:border-[#2e343b]">
    <p class="text-xs font-semibold text-brand-700 dark:text-[#c8ff4d]">使い方</p>
    <h2 class="mt-1 text-xl leading-snug font-bold text-gray-900 dark:text-[#f6f5f0]">
      3ステップで始められます
    </h2>
    <ol class="mt-4 space-y-3">
      <li v-for="(step, i) in steps" :key="step" class="flex items-center gap-3">
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white dark:bg-[#c8ff4d] dark:text-[#15181c]"
        >
          {{ i + 1 }}
        </span>
        <span class="text-sm text-gray-900 dark:text-[#f6f5f0]">{{ step }}</span>
      </li>
    </ol>
  </section>
</template>
