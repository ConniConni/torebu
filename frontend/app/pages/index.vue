<script setup lang="ts">
// 「/」は認証状態で出し分ける（Issue #151）：未ログインならイラスト付きのトップ画面
// （WelcomeScreen）、ログイン中は従来のホーム画面（HomeScreen）を表示する。
// 以前は`auth`ミドルウェアで未ログイン時に`/login`へ強制リダイレクトしていたが、
// 未ログインでも「/」自体にトップ画面を出したいため、リダイレクトはやめてこの分岐に置き換えた
// レイアウトは常にtabbarを指定するが、タブバー自体はレイアウト側でuser未ログイン時は非表示にする
// （Issue #174）
definePageMeta({ layout: 'tabbar' })
const { user, fetchMe } = useAuth()
if (!user.value) {
  await fetchMe()
}
</script>

<template>
  <HomeScreen v-if="user" />
  <WelcomeScreen v-else />
</template>
