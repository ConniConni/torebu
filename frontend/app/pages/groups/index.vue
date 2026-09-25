<script setup lang="ts">
// Phase4: グループ一覧。所属グループの作成・一覧表示・招待コードで参加する画面への導線
definePageMeta({ middleware: 'auth', layout: 'tabbar' })

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
  <div class="min-h-screen bg-gray-50 dark:bg-surface px-4 py-6 pb-24">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <h1 class="text-base font-semibold text-gray-900 dark:text-ink">グループ</h1>

      <NuxtLink
        to="/groups/join"
        class="rounded border border-brand-600 dark:border-accent py-2 text-center text-sm font-semibold text-brand-600 dark:text-accent"
      >
        招待コードで参加する
      </NuxtLink>

      <form class="flex items-end gap-2" @submit.prevent="onCreate">
        <label class="flex flex-1 flex-col gap-1 text-sm text-gray-700 dark:text-ink">
          新しいグループ名
          <input
            v-model="newName"
            type="text"
            maxlength="50"
            placeholder="例：ベンチプレス部"
            class="rounded border border-gray-300 dark:border-border-dark px-3 py-2 text-sm bg-white dark:bg-panel text-gray-900 dark:text-ink"
          />
        </label>
        <button
          type="submit"
          :disabled="!newName.trim() || submitting"
          class="shrink-0 whitespace-nowrap rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent dark:text-surface"
        >
          作成
        </button>
      </form>
      <p v-if="errorMessage" class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>

      <LoadingText v-if="pending" center />
      <p v-else-if="error" class="text-center text-sm text-red-600 dark:text-red-400">
        グループ一覧の取得に失敗しました。時間をおいて再度お試しください
      </p>
      <p v-else-if="groups?.length === 0" class="text-center text-sm text-gray-500 dark:text-muted">
        所属しているグループがまだありません。上から作成するか、招待コードで参加できます
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="group in groups"
          :key="group.id"
          class="rounded-lg bg-white dark:bg-panel shadow"
        >
          <NuxtLink :to="`/groups/${group.id}`" class="flex items-center gap-2 p-4">
            <span class="flex-1 text-sm font-semibold text-gray-900 dark:text-ink">{{
              group.name
            }}</span>
            <span
              v-if="group.role === 'owner'"
              class="shrink-0 rounded-full bg-brand-50 dark:bg-accent/10 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:text-accent"
            >
              オーナー
            </span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
