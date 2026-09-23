<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { login } = useAuth()

const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)
const isPasswordVisible = ref(false)

async function onSubmit() {
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    await login({ email: email.value, password: password.value })
    await navigateTo('/')
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
      <NuxtLink to="/" class="mb-4 inline-block text-sm text-gray-500 dark:text-muted"
        >← トップに戻る</NuxtLink
      >
      <h1 class="mb-6 text-center text-xl font-bold text-gray-900 dark:text-ink">ログイン</h1>

      <form class="space-y-4" @submit.prevent="onSubmit">
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
            class="w-full rounded border border-gray-300 dark:border-border-dark px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:focus:border-accent"
          />
        </div>

        <div>
          <label for="password" class="mb-1 block text-sm font-medium text-gray-700 dark:text-ink">
            パスワード
          </label>
          <div class="relative">
            <input
              id="password"
              v-model="password"
              :type="isPasswordVisible ? 'text' : 'password'"
              required
              autocomplete="current-password"
              class="w-full rounded border border-gray-300 dark:border-border-dark px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none dark:focus:border-accent"
            />
            <button
              type="button"
              :aria-label="isPasswordVisible ? 'パスワードを非表示にする' : 'パスワードを表示する'"
              class="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-ink"
              @click="isPasswordVisible = !isPasswordVisible"
            >
              <EyeSlashIcon v-if="isPasswordVisible" class="h-5 w-5" />
              <EyeIcon v-else class="h-5 w-5" />
            </button>
          </div>
        </div>

        <p v-if="errorMessage" class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>

        <p class="text-right text-sm">
          <NuxtLink to="/password-reset" class="text-brand-600 dark:text-accent hover:underline">
            パスワードをお忘れの方
          </NuxtLink>
        </p>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full rounded bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 dark:bg-accent dark:text-surface dark:hover:bg-accent/90"
        >
          ログイン
        </button>
      </form>

      <p class="mt-4 text-center text-sm text-gray-600 dark:text-muted">
        アカウントをお持ちでない方は
        <NuxtLink to="/register" class="text-brand-600 dark:text-accent hover:underline"
          >新規登録</NuxtLink
        >
      </p>
    </div>
  </div>
</template>
