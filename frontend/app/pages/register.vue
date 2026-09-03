<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { register } = useAuth()

const email = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const displayName = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

async function onSubmit() {
  errorMessage.value = ''

  if (password.value !== passwordConfirmation.value) {
    errorMessage.value = 'パスワードが一致しません'
    return
  }

  isSubmitting.value = true
  try {
    await register({ email: email.value, password: password.value, displayName: displayName.value })
    await navigateTo('/')
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
      <h1 class="mb-6 text-center text-xl font-bold text-gray-900">新規登録</h1>

      <form class="space-y-4" @submit.prevent="onSubmit">
        <div>
          <label for="displayName" class="mb-1 block text-sm font-medium text-gray-700">
            表示名
          </label>
          <input
            id="displayName"
            v-model="displayName"
            type="text"
            required
            maxlength="50"
            autocomplete="nickname"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label for="email" class="mb-1 block text-sm font-medium text-gray-700">
            メールアドレス
          </label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label for="password" class="mb-1 block text-sm font-medium text-gray-700">
            パスワード
          </label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            minlength="8"
            maxlength="72"
            autocomplete="new-password"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p class="mt-1 text-xs text-gray-500">8文字以上で入力してください</p>
        </div>

        <div>
          <label for="passwordConfirmation" class="mb-1 block text-sm font-medium text-gray-700">
            パスワード（確認）
          </label>
          <input
            id="passwordConfirmation"
            v-model="passwordConfirmation"
            type="password"
            required
            autocomplete="new-password"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          登録する
        </button>
      </form>

      <p class="mt-4 text-center text-sm text-gray-600">
        アカウントをお持ちの方は
        <NuxtLink to="/login" class="text-blue-600 hover:underline">ログイン</NuxtLink>
      </p>
    </div>
  </div>
</template>
