<script setup lang="ts">
// ⑨マイページ配下のパスワード変更画面（Issue #247）。ログイン中に現在のパスワードを入力して
// その場で変更する（忘れた場合のメールリセット〔/password-reset〕とは別物）。
// 変更後もログイン状態は維持される（POST /auth/password-changes参照）
definePageMeta({ middleware: 'auth' })

const { changePassword } = useAuth()

const currentPassword = ref('')
const newPassword = ref('')
const newPasswordConfirmation = ref('')
const isCurrentPasswordVisible = ref(false)
const isNewPasswordVisible = ref(false)
const isNewPasswordConfirmationVisible = ref(false)
const errorMessage = ref('')
const isSubmitting = ref(false)
const isCompleted = ref(false)

async function onSubmit() {
  errorMessage.value = ''
  if (newPassword.value !== newPasswordConfirmation.value) {
    errorMessage.value = '新しいパスワードが一致しません'
    return
  }
  isSubmitting.value = true
  try {
    await changePassword(currentPassword.value, newPassword.value)
    isCompleted.value = true
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-surface">
    <PageHeader back-to="/mypage" back-label="マイページに戻る" title="パスワードの変更" />
    <div class="px-4 pb-24">
      <div class="mx-auto flex max-w-sm flex-col gap-4">
        <div class="rounded-lg bg-white dark:bg-panel p-4 shadow">
          <template v-if="isCompleted">
            <p class="mb-4 text-sm text-gray-700 dark:text-ink">
              パスワードを変更しました。次回のログインから新しいパスワードをお使いください。
            </p>
            <NuxtLink
              to="/mypage"
              class="block rounded bg-brand-600 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700 dark:bg-accent dark:text-surface dark:hover:bg-accent/90"
            >
              マイページに戻る
            </NuxtLink>
          </template>

          <form v-else class="space-y-4" @submit.prevent="onSubmit">
            <div>
              <label
                for="current-password"
                class="mb-1 block text-sm font-medium text-gray-700 dark:text-ink"
              >
                現在のパスワード
              </label>
              <div class="relative">
                <input
                  id="current-password"
                  v-model="currentPassword"
                  :type="isCurrentPasswordVisible ? 'text' : 'password'"
                  required
                  autocomplete="current-password"
                  class="w-full rounded border border-gray-300 dark:border-border-dark px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none dark:focus:border-accent bg-white dark:bg-panel text-gray-900 dark:text-ink"
                />
                <button
                  type="button"
                  :aria-label="
                    isCurrentPasswordVisible ? 'パスワードを非表示にする' : 'パスワードを表示する'
                  "
                  class="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-ink"
                  @click="isCurrentPasswordVisible = !isCurrentPasswordVisible"
                >
                  <EyeSlashIcon v-if="isCurrentPasswordVisible" class="h-5 w-5" />
                  <EyeIcon v-else class="h-5 w-5" />
                </button>
              </div>
            </div>

            <div>
              <label
                for="new-password"
                class="mb-1 block text-sm font-medium text-gray-700 dark:text-ink"
              >
                新しいパスワード
              </label>
              <div class="relative">
                <input
                  id="new-password"
                  v-model="newPassword"
                  :type="isNewPasswordVisible ? 'text' : 'password'"
                  required
                  minlength="8"
                  maxlength="72"
                  autocomplete="new-password"
                  class="w-full rounded border border-gray-300 dark:border-border-dark px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none dark:focus:border-accent bg-white dark:bg-panel text-gray-900 dark:text-ink"
                />
                <button
                  type="button"
                  :aria-label="
                    isNewPasswordVisible ? 'パスワードを非表示にする' : 'パスワードを表示する'
                  "
                  class="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-ink"
                  @click="isNewPasswordVisible = !isNewPasswordVisible"
                >
                  <EyeSlashIcon v-if="isNewPasswordVisible" class="h-5 w-5" />
                  <EyeIcon v-else class="h-5 w-5" />
                </button>
              </div>
              <p class="mt-1 text-xs text-gray-500 dark:text-muted">8文字以上で入力してください</p>
            </div>

            <div>
              <label
                for="new-password-confirmation"
                class="mb-1 block text-sm font-medium text-gray-700 dark:text-ink"
              >
                新しいパスワード（確認）
              </label>
              <div class="relative">
                <input
                  id="new-password-confirmation"
                  v-model="newPasswordConfirmation"
                  :type="isNewPasswordConfirmationVisible ? 'text' : 'password'"
                  required
                  autocomplete="new-password"
                  class="w-full rounded border border-gray-300 dark:border-border-dark px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none dark:focus:border-accent bg-white dark:bg-panel text-gray-900 dark:text-ink"
                />
                <button
                  type="button"
                  :aria-label="
                    isNewPasswordConfirmationVisible
                      ? 'パスワードを非表示にする'
                      : 'パスワードを表示する'
                  "
                  class="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-ink"
                  @click="isNewPasswordConfirmationVisible = !isNewPasswordConfirmationVisible"
                >
                  <EyeSlashIcon v-if="isNewPasswordConfirmationVisible" class="h-5 w-5" />
                  <EyeIcon v-else class="h-5 w-5" />
                </button>
              </div>
            </div>

            <p v-if="errorMessage" class="text-sm text-red-600 dark:text-red-400">
              {{ errorMessage }}
            </p>

            <button
              type="submit"
              :disabled="isSubmitting"
              class="w-full rounded bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 dark:bg-accent dark:text-surface dark:hover:bg-accent/90"
            >
              パスワードを変更する
            </button>

            <!-- /password-resetはguestミドルウェア付きで、ログイン中に開くと/へ戻されてしまうため
               リンクにはせず、手順の案内だけにする -->
            <p class="text-xs text-gray-500 dark:text-muted">
              現在のパスワードを忘れた場合は、ログアウトしてからログイン画面の「パスワードをお忘れの方」から再設定してください。
            </p>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
