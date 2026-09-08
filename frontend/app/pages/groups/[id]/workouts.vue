<script setup lang="ts">
// Phase4: グループメンバーの記録フィード。所属メンバー全員(本人含む)の記録を新しい順に表示する
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const groupId = route.params.id as string

const { fetchGroupWorkouts } = useGroups()

const workouts = ref<Awaited<ReturnType<typeof fetchGroupWorkouts>> | null>(null)
const pending = ref(true)
const loadError = ref(false)

async function load() {
  pending.value = true
  loadError.value = false
  try {
    workouts.value = await fetchGroupWorkouts(groupId)
  } catch {
    loadError.value = true
  } finally {
    pending.value = false
  }
}
await load()
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <NuxtLink :to="`/groups/${groupId}`" class="text-sm text-gray-500">← グループに戻る</NuxtLink>
        <h1 class="text-base font-semibold text-gray-900">みんなの記録</h1>
      </div>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="loadError" class="text-center text-sm text-red-600">
        記録の取得に失敗しました。時間をおいて再度お試しください
      </p>
      <p v-else-if="!workouts || workouts.length === 0" class="text-center text-sm text-gray-500">
        まだ記録がありません
      </p>

      <ul v-else class="flex flex-col gap-3">
        <li v-for="workout in workouts" :key="workout.id" class="rounded-lg bg-white p-4 shadow">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-gray-900">{{ workout.displayName }}</span>
            <span class="text-xs text-gray-500">{{ workout.performedAt }}</span>
          </div>
          <p v-if="workout.memo" class="mt-1 text-xs text-gray-500">{{ workout.memo }}</p>
          <ul v-if="workout.exerciseSummaries.length > 0" class="mt-2 flex flex-col gap-1">
            <li
              v-for="summary in workout.exerciseSummaries"
              :key="summary.name"
              class="text-sm text-gray-700"
            >
              {{ summary.name }}（{{ summary.setCount }}セット）
            </li>
          </ul>
          <p v-else-if="!workout.memo" class="mt-1 text-xs text-gray-400">記録内容はまだありません</p>
        </li>
      </ul>
    </div>
  </div>
</template>
