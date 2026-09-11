<script setup lang="ts">
// 未ログイン時の「/」に表示するトップ画面（Issue #151）。
// 見出し・サブテキスト・下部バーの文言はHTML/CSSで重ね、イラストのみ画像を使う構成にしている
// （Issue #176）。画像に文字を焼き込んで全画面objectcoverする方式だと、画面比率によって
// 文字が見切れたり、絶対座標で重ねたボタンと画像内の文字が重なったりする問題があったため
import topIllustration from '~/assets/images/top_illustration.jpeg'
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-brand-50">
    <!-- 見出し・サブテキスト（HTML）。画面が小さいときも詰まりすぎないよう最小限のpaddingのみ -->
    <div class="shrink-0 px-6 pt-8 pb-4">
      <h1 class="text-2xl font-bold leading-snug text-gray-900">
        一緒だから<br />
        続けられる。
      </h1>
      <p class="mt-3 text-sm leading-relaxed text-gray-700">
        トレーニングの記録を仲間とシェアして、<br />
        もっと楽しく、もっと続く。
      </p>
    </div>

    <!-- イラスト部分。残りの高さをすべて使い、画面比率に応じてobject-coverで自然にクロップする -->
    <div class="min-h-0 flex-1">
      <img :src="topIllustration" alt="" class="h-full w-full object-cover object-top" />
    </div>

    <!-- 下部バー（HTML）。文言・ボタンとも画像から独立しているので重なりが起きない -->
    <div class="shrink-0 bg-brand-600 px-6 pt-5 text-white" style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom))">
      <div class="flex items-center gap-3 text-sm font-semibold">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="h-5 w-5 shrink-0">
          <path d="M4 9v6M2 10.5v3M20 9v6M22 10.5v3M7 12h10" />
        </svg>
        <p class="leading-relaxed">
          仲間と一緒に、<br />
          あなたの筋トレをもっと楽しく。
        </p>
      </div>

      <div class="mt-4 flex gap-3">
        <NuxtLink
          to="/login"
          class="flex-1 rounded-full bg-white py-2.5 text-center text-sm font-semibold text-brand-700 shadow"
        >
          ログイン
        </NuxtLink>
        <NuxtLink
          to="/register"
          class="flex-1 rounded-full border border-white py-2.5 text-center text-sm font-semibold text-white"
        >
          新規登録
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
