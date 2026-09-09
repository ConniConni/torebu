<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { register } = useAuth()

const email = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const displayName = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

// 生年月（年月のみ）。「回答しない」の場合は年月の選択欄を無効化する
const birthDateNoAnswer = ref(false)
const birthYear = ref('')
const birthMonth = ref('')
const currentYear = new Date().getFullYear()
const birthYearOptions = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => currentYear - i)
const birthMonthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

type Gender = 'male' | 'female' | 'other' | 'no_answer'
type Occupation =
  | 'student'
  | 'company_employee'
  | 'self_employed'
  | 'executive'
  | 'homemaker'
  | 'other'
  | 'no_answer'

const gender = ref<Gender | ''>('')
const occupation = ref<Occupation | ''>('')

// 利用規約・プライバシーポリシーへの同意（Issue #160）。未チェックでは登録できない
const agreedToTerms = ref(false)

async function onSubmit() {
  errorMessage.value = ''

  if (password.value !== passwordConfirmation.value) {
    errorMessage.value = 'パスワードが一致しません'
    return
  }

  if (!birthDateNoAnswer.value && (!birthYear.value || !birthMonth.value)) {
    errorMessage.value = '生年月を入力するか、「回答しない」を選択してください'
    return
  }
  if (!gender.value || !occupation.value) {
    errorMessage.value = '性別・職業を選択してください'
    return
  }
  if (!agreedToTerms.value) {
    errorMessage.value = '利用規約・プライバシーポリシーへの同意が必要です'
    return
  }

  isSubmitting.value = true
  try {
    await register({
      email: email.value,
      password: password.value,
      displayName: displayName.value,
      birthYearMonth: birthDateNoAnswer.value
        ? 'no_answer'
        : { year: Number(birthYear.value), month: Number(birthMonth.value) },
      gender: gender.value,
      occupation: occupation.value,
    })
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
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
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
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
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
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
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
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div>
          <span class="mb-1 block text-sm font-medium text-gray-700">生年月</span>
          <div class="flex gap-2">
            <select
              v-model="birthYear"
              :disabled="birthDateNoAnswer"
              :required="!birthDateNoAnswer"
              class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-gray-100"
            >
              <option value="" disabled>年</option>
              <option v-for="year in birthYearOptions" :key="year" :value="year">
                {{ year }}年
              </option>
            </select>
            <select
              v-model="birthMonth"
              :disabled="birthDateNoAnswer"
              :required="!birthDateNoAnswer"
              class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-gray-100"
            >
              <option value="" disabled>月</option>
              <option v-for="month in birthMonthOptions" :key="month" :value="month">
                {{ month }}月
              </option>
            </select>
          </div>
          <label class="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
            <input v-model="birthDateNoAnswer" type="checkbox" />
            回答しない
          </label>
        </div>

        <div>
          <label for="gender" class="mb-1 block text-sm font-medium text-gray-700">性別</label>
          <select
            id="gender"
            v-model="gender"
            required
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="" disabled>選択してください</option>
            <option value="male">男性</option>
            <option value="female">女性</option>
            <option value="other">その他</option>
            <option value="no_answer">回答しない</option>
          </select>
        </div>

        <div>
          <label for="occupation" class="mb-1 block text-sm font-medium text-gray-700">職業</label>
          <select
            id="occupation"
            v-model="occupation"
            required
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="" disabled>選択してください</option>
            <option value="student">学生</option>
            <option value="company_employee">会社員</option>
            <option value="self_employed">自営業</option>
            <option value="executive">役員</option>
            <option value="homemaker">主婦・主夫</option>
            <option value="other">その他</option>
            <option value="no_answer">回答しない</option>
          </select>
        </div>

        <label class="flex items-start gap-2 text-sm text-gray-600">
          <input v-model="agreedToTerms" type="checkbox" required class="mt-0.5" />
          <span>
            <NuxtLink to="/terms" target="_blank" class="text-brand-600 hover:underline">
              利用規約
            </NuxtLink>
            ・
            <NuxtLink to="/privacy" target="_blank" class="text-brand-600 hover:underline">
              プライバシーポリシー
            </NuxtLink>
            に同意する
          </span>
        </label>

        <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full rounded bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          登録する
        </button>
      </form>

      <p class="mt-4 text-center text-sm text-gray-600">
        アカウントをお持ちの方は
        <NuxtLink to="/login" class="text-brand-600 hover:underline">ログイン</NuxtLink>
      </p>
    </div>
  </div>
</template>
