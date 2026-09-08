<script setup lang="ts">
// Phase4: グループ一覧。所属グループの作成・一覧表示・招待コードで参加する画面への導線
definePageMeta({ middleware: 'auth' })

const { groups, pending, error, fetchGroups, createGroup } = useGroups()
if (!groups.value) {
  await fetchGroups()
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
    const group = await createGroup(name)
    newName.value = ''
    await navigateTo(`/groups/${group.id}`)
  } catch (e) {
    errorMessage.value = groupErrorMessage(e)
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
        <h1 class="text-base font-semibold text-gray-900">グループ</h1>
      </div>

      <NuxtLink
        to="/groups/join"
        class="rounded border border-brand-600 py-2 text-center text-sm font-semibold text-brand-600"
      >
        招待コードで参加する
      </NuxtLink>

      <form class="flex items-end gap-2" @submit.prevent="onCreate">
        <label class="flex flex-1 flex-col gap-1 text-sm text-gray-700">
          新しいグループ名
          <input
            v-model="newName"
            type="text"
            maxlength="50"
            placeholder="例：ベンチプレス部"
            class="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          :disabled="!newName.trim() || submitting"
          class="shrink-0 whitespace-nowrap rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          作成
        </button>
      </form>
      <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error" class="text-center text-sm text-red-600">
        グループ一覧の取得に失敗しました。時間をおいて再度お試しください
      </p>
      <p v-else-if="groups?.length === 0" class="text-center text-sm text-gray-500">
        所属しているグループがまだありません。上から作成するか、招待コードで参加できます
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="group in groups" :key="group.id" class="rounded-lg bg-white shadow">
          <NuxtLink :to="`/groups/${group.id}`" class="flex items-center gap-2 p-4">
            <span class="flex-1 text-sm font-semibold text-gray-900">{{ group.name }}</span>
            <span
              v-if="group.role === 'owner'"
              class="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700"
            >
              オーナー
            </span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
