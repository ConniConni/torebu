<script setup lang="ts">
// ホーム画面本体はIssue9（カレンダー表示）で実装する。ここではログイン状態確認用の暫定表示のみ
definePageMeta({ middleware: 'auth' })

const { user, logout } = useAuth()

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4">
    <p class="text-lg text-gray-900">ようこそ、{{ user?.displayName }}さん</p>
    <button
      type="button"
      class="rounded bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-300"
      @click="onLogout"
    >
      ログアウト
    </button>
  </div>
</template>
