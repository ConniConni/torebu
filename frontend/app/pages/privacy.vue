<script setup lang="ts">
// プライバシーポリシー（Issue #160）。本文はPrivacyContent.vue（Issue #189でモーダルと共用するため切り出し）。
// ミドルウェアは付けない：ログイン前（新規登録画面）・ログイン後どちらからも参照できる必要があるため
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-8">
    <div class="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow">
      <PrivacyContent />

      <p class="mt-8 text-center text-sm text-gray-600">
        <NuxtLink to="/terms" class="text-brand-600 hover:underline">利用規約</NuxtLink>
        ・
        <NuxtLink to="/" class="text-brand-600 hover:underline">トップへ戻る</NuxtLink>
      </p>
    </div>
  </div>
</template>
