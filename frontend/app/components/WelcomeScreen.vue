<script setup lang="ts">
// 未ログイン時の「/」に表示するトップ画面（Issue #151）。イラストを画面いっぱいに表示し、
// イラスト下部のオレンジの余白部分にログイン・新規登録ボタンを重ねて配置する
import topImage from '~/assets/images/top_image.png'
</script>

<template>
  <div class="relative h-screen overflow-hidden bg-brand-50">
    <!-- object-bottom（object-position: bottom）で常に画像の下端を基準に切り抜く。
         デフォルトの中央基準だと画面の縦横比が変わるたびに「どの部分を映すか」がずれ、
         下部のオレンジの余白（ボタンの重なる位置）とのバランスが崩れてしまうため -->
    <img :src="topImage" alt="トレ部" class="h-full w-full object-cover object-bottom" />

    <!-- イラスト下部の無地のオレンジ部分（画像下端から約10%）にボタンを重ねる。
         安全にボタンが収まる余白であることをtop_image.pngのピクセル解析で確認済み -->
    <div class="absolute inset-x-6 bottom-5 flex gap-3">
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
</template>
