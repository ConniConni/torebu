<!-- 特設ページ「よくある質問」（Issue #332）。<details>で折りたたむ（JS不要、SSRでも本文がHTMLに入る）。
     有料の中身（ダークモード・種目追加など）は具体的に書かず「機能の追加や拡張」「上限」に留める -->
<script setup lang="ts">
const faqs = [
  {
    q: '無料で使えますか？',
    a: '基本的な機能は無料で使えます。今後、機能の追加や拡張を有料で提供する予定です。',
  },
  {
    q: '記録は誰に見えますか？',
    a: '同じグループの仲間にだけ見えます。公開されることはありません。',
  },
  {
    q: '一人でも使えますか？',
    a: '記録だけでも使えます。仲間を招待すると、応援やランキングが楽しめます。',
  },
  {
    q: 'グループは何人まで？',
    a: '1グループ5人までです。今後、有料で上限を広げられるようにする予定です。',
  },
  {
    q: '招待されたときは？',
    a: '届いた招待リンクから登録すると、そのグループに参加できます。',
  },
]
</script>

<template>
  <section class="border-t border-brand-100 px-6 py-10 dark:border-[#2e343b]">
    <p class="text-xs font-semibold text-brand-700 dark:text-[#c8ff4d]">よくある質問</p>
    <h2 class="mt-1 text-xl leading-snug font-bold text-gray-900 dark:text-[#f6f5f0]">FAQ</h2>
    <div class="mt-3">
      <details
        v-for="faq in faqs"
        :key="faq.q"
        class="group border-b border-brand-100 py-3 dark:border-[#2e343b]"
      >
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-gray-900 dark:text-[#f6f5f0] [&::-webkit-details-marker]:hidden"
        >
          {{ faq.q }}
          <span class="text-brand-600 group-open:hidden dark:text-[#c8ff4d]" aria-hidden="true"
            >＋</span
          >
          <span
            class="hidden text-brand-600 group-open:inline dark:text-[#c8ff4d]"
            aria-hidden="true"
            >−</span
          >
        </summary>
        <p class="mt-2 text-sm leading-relaxed text-gray-700 dark:text-[#b7b6ad]">{{ faq.a }}</p>
      </details>
    </div>
  </section>
</template>
