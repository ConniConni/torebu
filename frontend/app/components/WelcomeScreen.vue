<script setup lang="ts">
// 未ログイン時の「/」に表示するトップ画面（Issue #151）。イラストを画面いっぱいに見せ、
// 下部にログイン・新規登録への導線を置く
import topImage from '~/assets/images/top_image.png'
</script>

<template>
  <div class="flex h-screen flex-col bg-gray-50">
    <div class="min-h-0 flex-1 overflow-hidden bg-brand-50">
      <img :src="topImage" alt="トレ部" class="h-full w-full object-cover" />
    </div>

    <div class="flex flex-col gap-3 px-6 py-6">
      <NuxtLink
        to="/login"
        class="w-full rounded bg-brand-600 py-2.5 text-center text-sm font-semibold text-white"
      >
        ログイン
      </NuxtLink>
      <NuxtLink
        to="/register"
        class="w-full rounded border border-brand-600 py-2.5 text-center text-sm font-semibold text-brand-600"
      >
        新規登録
      </NuxtLink>
    </div>
  </div>
</template>
