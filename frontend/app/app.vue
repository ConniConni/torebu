<script setup lang="ts">
// ダークモードの土台（Issue #239）。保存済みのテーマ（未保存ならlight）を起動時に反映する
const { initTheme } = useTheme()
onMounted(() => {
  initTheme()
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <!-- 画面遷移中（ミドルウェア・ルートガードの待ち含む）に上部へ進捗バーを出す -->
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
