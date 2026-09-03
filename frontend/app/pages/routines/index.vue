<script setup lang="ts">
// ⑤ ルーティン一覧。よく使うメニューをテンプレート登録する画面の入口
definePageMeta({ middleware: 'auth' })

const { routines, pending, error, fetchRoutines, createRoutine } = useRoutines()
if (!routines.value) {
  await fetchRoutines()
}

const newName = ref('')
const submitting = ref(false)
const errorMessage = ref('')

async function onCreate() {
  const name = newName.value.trim()
  if (!name) return
  submitting.value = true
  errorMessage.value = ''
  try {
    const routine = await createRoutine(name)
    newName.value = ''
    await navigateTo(`/routines/${routine.id}`)
  } catch {
    errorMessage.value = 'ルーティンの作成に失敗しました。時間をおいて再度お試しください'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <NuxtLink to="/" class="text-sm text-gray-500">← ホームに戻る</NuxtLink>
        <h1 class="text-base font-semibold text-gray-900">ルーティン</h1>
      </div>

      <form class="flex items-end gap-2" @submit.prevent="onCreate">
        <label class="flex flex-1 flex-col gap-1 text-sm text-gray-700">
          新しいルーティン名
          <input
            v-model="newName"
            type="text"
            maxlength="50"
            placeholder="例：胸の日"
            class="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          :disabled="!newName.trim() || submitting"
          class="shrink-0 whitespace-nowrap rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          追加
        </button>
      </form>
      <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error" class="text-center text-sm text-red-600">
        ルーティン一覧の取得に失敗しました。時間をおいて再度お試しください
      </p>
      <p v-else-if="routines?.length === 0" class="text-center text-sm text-gray-500">
        ルーティンがまだありません。上の入力欄から作成できます
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="routine in routines" :key="routine.id">
          <NuxtLink
            :to="`/routines/${routine.id}`"
            class="block rounded-lg bg-white p-4 text-sm font-semibold text-gray-900 shadow"
          >
            {{ routine.name }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
