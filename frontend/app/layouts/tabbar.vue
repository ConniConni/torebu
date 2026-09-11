<!--
  下部固定タブバーを持つレイアウト（Issue #174）。対象はホーム／ルーティン／統計／グループの
  4画面のみで、各ページで`definePageMeta({ layout: 'tabbar' })`を指定して使う。
  ホーム（/）は未ログイン時にWelcomeScreenを出すため、その場合はタブバーを表示しない。
-->
<script setup lang="ts">
const { user } = useAuth()
</script>

<template>
  <div>
    <slot />
    <BottomTabBar v-if="user" />
  </div>
</template>
