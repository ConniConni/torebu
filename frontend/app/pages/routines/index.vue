<script setup lang="ts">
// ⑤ ルーティン一覧。よく使うメニューをテンプレート登録する画面の入口
definePageMeta({ middleware: 'auth' })

const { routines, pending, error, fetchRoutines, createRoutine, deleteRoutine } = useRoutines()
if (!routines.value) {
  await fetchRoutines()
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
    const routine = await createRoutine(name)
    newName.value = ''
    await navigateTo(`/routines/${routine.id}`)
  } catch {
    errorMessage.value = 'ルーティンの作成に失敗しました。時間をおいて再度お試しください'
  } finally {
    submitting.value = false
  }
}

// 「このルーティンを削除する」（本体削除）はここ⑤一覧の行内に置く（Issue #93）。
// ルーティン詳細（routines/[id].vue）に単独で置くと、🗑️アイコンだけでは意味が
// 伝わりにくい・名前が確認しづらいという理由で、名前が並ぶ一覧側へ寄せた
const confirmingDeleteId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const deleteError = ref('')

async function onDeleteRoutine(id: string) {
  deletingId.value = id
  deleteError.value = ''
  try {
    await deleteRoutine(id)
    confirmingDeleteId.value = null
  } catch {
    deleteError.value = '削除に失敗しました。時間をおいて再度お試しください'
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <NuxtLink to="/" class="text-sm text-gray-500">← ホームに戻る</NuxtLink>
        <h1 class="text-base font-semibold text-gray-900">ルーティン</h1>
      </div>

      <form class="flex items-end gap-2" @submit.prevent="onCreate">
        <label class="flex flex-1 flex-col gap-1 text-sm text-gray-700">
          新しいルーティン名
          <input
            v-model="newName"
            type="text"
            maxlength="50"
            placeholder="例：胸の日"
            class="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          :disabled="!newName.trim() || submitting"
          class="shrink-0 whitespace-nowrap rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          追加
        </button>
      </form>
      <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error" class="text-center text-sm text-red-600">
        ルーティン一覧の取得に失敗しました。時間をおいて再度お試しください
      </p>
      <p v-else-if="routines?.length === 0" class="text-center text-sm text-gray-500">
        ルーティンがまだありません。上の入力欄から作成できます
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="routine in routines" :key="routine.id" class="rounded-lg bg-white shadow">
          <template v-if="confirmingDeleteId === routine.id">
            <div class="flex flex-col gap-2 p-4">
              <p class="text-sm text-gray-700">「{{ routine.name }}」を削除しますか？（元に戻せません）</p>
              <div class="flex gap-2">
                <button
                  type="button"
                  :disabled="deletingId === routine.id"
                  class="flex-1 rounded border border-gray-300 py-1.5 text-sm text-gray-700 disabled:opacity-50"
                  @click="confirmingDeleteId = null"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  :disabled="deletingId === routine.id"
                  class="flex-1 rounded bg-red-600 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  @click="onDeleteRoutine(routine.id)"
                >
                  {{ deletingId === routine.id ? '削除中...' : '削除する' }}
                </button>
              </div>
              <p v-if="deleteError" class="text-sm text-red-600">{{ deleteError }}</p>
            </div>
          </template>
          <div v-else class="flex items-center gap-2 p-4">
            <NuxtLink :to="`/routines/${routine.id}`" class="flex-1 text-sm font-semibold text-gray-900">
              {{ routine.name }}
            </NuxtLink>
            <button
              type="button"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600"
              aria-label="このルーティンを削除する"
              @click="confirmingDeleteId = routine.id"
            >
              <TrashIcon class="h-4 w-4" />
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
