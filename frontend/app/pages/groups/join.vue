<script setup lang="ts">
// Phase4: 招待コードで参加する画面
definePageMeta({ middleware: 'auth' })

const { joinGroup } = useGroups()

const inviteCode = ref('')
const submitting = ref(false)
const errorMessage = ref('')

async function onJoin() {
  const code = inviteCode.value.trim()
  if (!code) return
  submitting.value = true
  errorMessage.value = ''
  try {
    const group = await joinGroup(code)
    await navigateTo(`/groups/${group.id}`)
  } catch (e) {
    errorMessage.value = groupErrorMessage(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-surface">
    <PageHeader back-to="/groups" back-label="グループに戻る" title="招待コードで参加" />
    <div class="px-4 pb-6">
      <div class="mx-auto flex max-w-sm flex-col gap-4">
        <form class="flex flex-col gap-3" @submit.prevent="onJoin">
          <label class="flex flex-col gap-1 text-sm text-gray-700 dark:text-ink">
            招待コード
            <input
              v-model="inviteCode"
              type="text"
              placeholder="オーナーから共有された招待コードを貼り付け"
              class="rounded border border-gray-300 dark:border-border-dark px-3 py-2 text-sm bg-white dark:bg-panel text-gray-900 dark:text-ink"
            />
          </label>
          <button
            type="submit"
            :disabled="!inviteCode.trim() || submitting"
            class="rounded bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent dark:text-surface"
          >
            {{ submitting ? '参加中...' : '参加する' }}
          </button>
          <p v-if="errorMessage" class="text-sm text-red-600 dark:text-red-400">
            {{ errorMessage }}
          </p>
        </form>
      </div>
    </div>
  </div>
</template>
