<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { requestPasswordReset } = useAuth()

const email = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)
const isCompleted = ref(false)

async function onSubmit() {
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    await requestPasswordReset(email.value)
    isCompleted.value = true
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-surface px-4">
    <div class="w-full max-w-sm rounded-lg bg-white dark:bg-panel p-6 shadow">
      <NuxtLink to="/login" class="mb-4 inline-block text-sm text-gray-500 dark:text-muted">
        ← ログインに戻る
      </NuxtLink>
      <h1 class="mb-6 text-center text-xl font-bold text-gray-900 dark:text-ink">
        パスワードの再設定
      </h1>

      <template v-if="isCompleted">
        <p class="text-sm text-gray-700 dark:text-ink">
          入力されたメールアドレス宛にパスワード再設定のご案内を送信しました。メールが届かない場合は、
          メールアドレスが登録されていないか、迷惑メールフォルダに振り分けられている可能性があります。
        </p>
      </template>

      <form v-else class="space-y-4" @submit.prevent="onSubmit">
        <div>
          <label for="email" class="mb-1 block text-sm font-medium text-gray-700 dark:text-ink">
            メールアドレス
          </label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="w-full rounded border border-gray-300 dark:border-border-dark px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:focus:border-accent bg-white dark:bg-panel text-gray-900 dark:text-ink"
          />
        </div>

        <p v-if="errorMessage" class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full rounded bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 dark:bg-accent dark:text-surface dark:hover:bg-accent/90"
        >
          再設定用のメールを送信
        </button>
      </form>
    </div>
  </div>
</template>
