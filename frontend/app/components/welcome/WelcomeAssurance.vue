<!-- 特設ページ「安心ポイント」（Issue #332）。無料の言い回しは「基本的な機能は無料」まで
     （ダークモード等が今後有料になる想定のため、「すべて無料」とは書かない） -->
<script setup lang="ts">
const points = [
  '招待した仲間にだけ見えます（公開SNSではありません）',
  '基本的な機能は無料で始められます',
  '画像シェアは自分で選んだときだけ（表示名・メモは載りません）',
]
</script>

<template>
  <section class="border-t border-brand-100 px-6 py-10 dark:border-[#2e343b]">
    <p class="text-xs font-semibold text-brand-700 dark:text-[#c8ff4d]">安心ポイント</p>
    <h2 class="mt-1 text-xl leading-snug font-bold text-gray-900 dark:text-[#f6f5f0]">
      安心して使えます
    </h2>
    <ul
      class="mt-4 space-y-3 rounded-xl border border-brand-100 bg-white p-4 dark:border-[#2e343b] dark:bg-[#1d2126]"
    >
      <li
        v-for="point in points"
        :key="point"
        class="flex gap-2 text-sm leading-relaxed text-gray-900 dark:text-[#f6f5f0]"
      >
        <span class="text-brand-600 dark:text-[#c8ff4d]" aria-hidden="true">✓</span>
        <span>{{ point }}</span>
      </li>
    </ul>
  </section>
</template>
