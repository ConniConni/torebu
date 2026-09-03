<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { user, logout } = useAuth()
const { workouts, pending, error, fetchWorkouts } = useWorkouts()

await fetchWorkouts()

const markedDates = computed(() => new Set((workouts.value ?? []).map((w) => w.performedAt)))

const selectedDate = ref(todayLocalDateString())
const selectedWorkouts = computed(() =>
  (workouts.value ?? []).filter((w) => w.performedAt === selectedDate.value),
)

function onSelectDate(date: string) {
  selectedDate.value = date
}

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-900">{{ user?.displayName }}さん</p>
        <button
          type="button"
          class="rounded bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-300"
          @click="onLogout"
        >
          ログアウト
        </button>
      </div>

      <button
        type="button"
        disabled
        title="準備中です（記録作成画面は近日公開）"
        class="w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white opacity-50"
      >
        ＋今日の記録を始める（準備中）
      </button>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error" class="text-center text-sm text-red-600">
        記録の取得に失敗しました。時間をおいて再度お試しください
      </p>

      <template v-else>
        <HomeCalendar
          :marked-dates="markedDates"
          :selected-date="selectedDate"
          @select="onSelectDate"
        />

        <div class="rounded-lg bg-white p-4 shadow">
          <p class="mb-2 text-sm font-semibold text-gray-900">{{ selectedDate }}の記録</p>
          <p v-if="selectedWorkouts.length === 0" class="text-sm text-gray-500">記録がありません</p>
          <ul v-else class="space-y-2">
            <li v-for="workout in selectedWorkouts" :key="workout.id" class="text-sm text-gray-700">
              {{ workout.memo || 'メモ無し' }}
            </li>
          </ul>
        </div>
      </template>
    </div>
  </div>
</template>
