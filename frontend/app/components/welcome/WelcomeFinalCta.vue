<!-- 特設ページ末尾のCTAとフッター（Issue #332）。利用規約・プライバシーは専用ページ（/terms, /privacy）へリンクする -->
<template>
  <section
    class="border-t border-brand-100 px-6 pt-10 text-center dark:border-[#2e343b]"
    style="padding-bottom: max(2rem, env(safe-area-inset-bottom))"
  >
    <h2 class="text-xl leading-snug font-bold text-gray-900 dark:text-[#f6f5f0]">
      まずは仲間と、1回記録してみよう
    </h2>
    <div class="mt-5 flex gap-3">
      <NuxtLink
        to="/register"
        class="flex-1 rounded-full bg-brand-600 py-2.5 text-center text-sm font-semibold text-white dark:bg-[#c8ff4d] dark:text-[#15181c]"
      >
        新規登録
      </NuxtLink>
      <NuxtLink
        to="/login"
        class="flex-1 rounded-full border border-brand-600 py-2.5 text-center text-sm font-semibold text-brand-700 dark:border-[#c8ff4d] dark:text-[#c8ff4d]"
      >
        ログイン
      </NuxtLink>
    </div>
    <p class="mt-6 text-xs text-gray-600 dark:text-[#b7b6ad]">
      <NuxtLink to="/terms" class="underline">利用規約</NuxtLink>
      <span class="mx-2" aria-hidden="true">・</span>
      <NuxtLink to="/privacy" class="underline">プライバシーポリシー</NuxtLink>
    </p>
  </section>
</template>
