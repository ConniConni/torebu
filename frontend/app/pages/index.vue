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

// 未ログイン時のみサービス紹介用のメタ情報を出す（検索エンジン・SNSシェア向け。Issue #204）。
// ログイン中は従来通りアプリのホーム画面として扱い、タイトルは変えない
// og:imageはOpen Graphの仕様上、相対パスだとSNS側で読み込めないため絶対URLにする
const ogImageUrl = new URL('/images/og-image.jpeg', useRequestURL().origin).href
useSeoMeta({
  title: user.value ? undefined : 'トレ部 | 仲間と筋トレを記録・応援しあうアプリ',
  description: user.value
    ? undefined
    : 'トレ部は、部活・筋トレ仲間などクローズドなグループでトレーニング記録にリアクション・コメントし合いながらランキングで競い合える、交流特化のトレーニング記録アプリです。',
  ogTitle: user.value ? undefined : 'トレ部 | 仲間と筋トレを記録・応援しあうアプリ',
  ogDescription: user.value
    ? undefined
    : '仲間と一緒に、あなたの筋トレをもっと楽しく。トレーニング記録にリアクション・コメントし合いながらランキングで競い合えるアプリです。',
  ogImage: user.value ? undefined : ogImageUrl,
  twitterCard: user.value ? undefined : 'summary_large_image',
})
</script>

<template>
  <HomeScreen v-if="user" />
  <WelcomeScreen v-else />
</template>
