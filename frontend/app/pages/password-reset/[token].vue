<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const route = useRoute()
const token = route.params.token as string

const { resetPassword } = useAuth()

const password = ref('')
const passwordConfirmation = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)
const isPasswordVisible = ref(false)

async function onSubmit() {
  errorMessage.value = ''
  if (password.value !== passwordConfirmation.value) {
    errorMessage.value = 'パスワードが一致しません'
    return
  }
  isSubmitting.value = true
  try {
    await resetPassword(token, password.value)
    await navigateTo('/login')
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
    <div class="w-full max-w-sm rounded-lg bg-white p-6 shadow">
      <h1 class="mb-6 text-center text-xl font-bold text-gray-900">新しいパスワードの設定</h1>

      <form class="space-y-4" @submit.prevent="onSubmit">
        <div>
          <label for="password" class="mb-1 block text-sm font-medium text-gray-700">
            新しいパスワード
          </label>
          <div class="relative">
            <input
              id="password"
              v-model="password"
              :type="isPasswordVisible ? 'text' : 'password'"
              required
              autocomplete="new-password"
              class="w-full rounded border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none"
            />
            <button
              type="button"
              :aria-label="isPasswordVisible ? 'パスワードを非表示にする' : 'パスワードを表示する'"
              class="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700"
              @click="isPasswordVisible = !isPasswordVisible"
            >
              <EyeSlashIcon v-if="isPasswordVisible" class="h-5 w-5" />
              <EyeIcon v-else class="h-5 w-5" />
            </button>
          </div>
          <p class="mt-1 text-xs text-gray-500">8文字以上で入力してください</p>
        </div>

        <div>
          <label for="passwordConfirmation" class="mb-1 block text-sm font-medium text-gray-700">
            新しいパスワード（確認）
          </label>
          <input
            id="passwordConfirmation"
            v-model="passwordConfirmation"
            :type="isPasswordVisible ? 'text' : 'password'"
            required
            autocomplete="new-password"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full rounded bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          パスワードを再設定
        </button>
      </form>
    </div>
  </div>
</template>
