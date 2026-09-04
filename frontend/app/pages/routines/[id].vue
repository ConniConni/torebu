<script setup lang="ts">
// ⑤ ルーティン編集。名前変更・削除、種目の追加/削除/並び替えを行う
import draggable from 'vuedraggable'

definePageMeta({ middleware: 'auth' })

interface RoutineExerciseItem {
  id: string
  routineId: string
  exerciseId: string
  sortOrder: number
  exercise: { id: string; name: string; muscleGroup: MuscleGroup }
}
interface RoutineDetail {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  exercises: RoutineExerciseItem[]
}

const route = useRoute()
const routineId = route.params.id as string
const requestFetch = useRequestFetch()

const routine = ref<RoutineDetail | null>(null)
const pending = ref(false)
const error = ref(false)

async function fetchRoutine() {
  pending.value = true
  error.value = false
  try {
    routine.value = await requestFetch<RoutineDetail>(`/api/routines/${routineId}`)
  } catch {
    error.value = true
  } finally {
    pending.value = false
  }
}
await fetchRoutine()

const exerciseError = ref('')

// ④種目選択・⑦種目追加(returnTo=このページ)から選ばれた種目を、戻ってきたタイミングで追加する
const pickedExerciseId = usePickedExerciseId()
if (pickedExerciseId.value) {
  const exerciseId = pickedExerciseId.value
  pickedExerciseId.value = null
  try {
    await addExercise(exerciseId)
  } catch {
    exerciseError.value = '種目の追加に失敗しました。時間をおいて再度お試しください'
  }
}

const nameInput = ref(routine.value?.name ?? '')
watch(routine, (r) => {
  if (r) nameInput.value = r.name
})

// 種目の追加/削除/並び替えと同じく、名前欄も明示的な保存ボタンは持たず
// blur（フォーカスが外れたタイミング）で自動保存する。値が変わっていなければAPIは呼ばない
const savingName = ref(false)
const nameError = ref('')

async function onNameBlur() {
  const name = nameInput.value.trim()
  if (!routine.value || !name || name === routine.value.name) return
  savingName.value = true
  nameError.value = ''
  try {
    const updated = await $fetch<{ name: string }>(`/api/routines/${routineId}`, {
      method: 'PATCH',
      body: { name },
    })
    if (routine.value) routine.value.name = updated.name
  } catch {
    nameError.value = '名前の変更に失敗しました。時間をおいて再度お試しください'
  } finally {
    savingName.value = false
  }
}

const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')

async function onDelete() {
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch(`/api/routines/${routineId}`, { method: 'DELETE' })
    await navigateTo('/routines')
  } catch {
    deleteError.value = '削除に失敗しました。時間をおいて再度お試しください'
    deleting.value = false
  }
}

async function addExercise(exerciseId: string) {
  if (!routine.value) return
  const nextSortOrder = routine.value.exercises.length
    ? Math.max(...routine.value.exercises.map((e) => e.sortOrder)) + 1
    : 1
  const created = await $fetch<{ id: string; routineId: string; exerciseId: string; sortOrder: number }>(
    `/api/routines/${routineId}/exercises`,
    { method: 'POST', body: { exerciseId, sortOrder: nextSortOrder } },
  )
  // POSTのレスポンスには種目名・部位が含まれないため、選択直前まで持っていたexercise一覧から補う
  const { exercises } = useExercises()
  const exercise = exercises.value?.find((e) => e.id === exerciseId)
  routine.value.exercises = [
    ...routine.value.exercises,
    { ...created, exercise: exercise ?? { id: exerciseId, name: '(不明な種目)', muscleGroup: 'chest' } },
  ]
}

async function removeExercise(routineExerciseId: string) {
  if (!routine.value) return
  exerciseError.value = ''
  try {
    await $fetch(`/api/routines/${routineId}/exercises/${routineExerciseId}`, { method: 'DELETE' })
    routine.value.exercises = routine.value.exercises.filter((e) => e.id !== routineExerciseId)
  } catch {
    exerciseError.value = '種目の削除に失敗しました。時間をおいて再度お試しください'
  }
}

// vuedraggableのv-modelで並び替えた後、変化した行だけsortOrderをPATCHで反映する
// (見た目上のindex(1始まり)をそのまま新しいsortOrderとして使う)
async function onDragEnd() {
  if (!routine.value) return
  exerciseError.value = ''
  const updates = routine.value.exercises
    .map((e, index) => ({ item: e, sortOrder: index + 1 }))
    .filter(({ item, sortOrder }) => item.sortOrder !== sortOrder)

  try {
    await Promise.all(
      updates.map(({ item, sortOrder }) =>
        $fetch(`/api/routines/${routineId}/exercises/${item.id}`, {
          method: 'PATCH',
          body: { sortOrder },
        }),
      ),
    )
    for (const { item, sortOrder } of updates) {
      item.sortOrder = sortOrder
    }
  } catch {
    exerciseError.value = '並び替えの保存に失敗しました。時間をおいて再度お試しください'
    await fetchRoutine()
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <NuxtLink to="/routines" class="text-sm text-gray-500">← ルーティン一覧に戻る</NuxtLink>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error || !routine" class="text-center text-sm text-red-600">
        ルーティンの取得に失敗しました。時間をおいて再度お試しください
      </p>

      <template v-else>
        <label class="flex flex-col gap-1 text-sm text-gray-700">
          ルーティン名
          <input
            v-model="nameInput"
            type="text"
            maxlength="50"
            class="rounded border border-gray-300 px-3 py-2 text-sm"
            @blur="onNameBlur"
          />
        </label>
        <p v-if="savingName" class="text-xs text-gray-400">保存中...</p>
        <p v-if="nameError" class="text-sm text-red-600">{{ nameError }}</p>

        <div class="rounded-lg bg-white p-4 shadow">
          <div class="mb-2 flex items-center justify-between">
            <p class="text-sm font-semibold text-gray-900">種目</p>
            <NuxtLink
              :to="{ path: '/workouts/exercises', query: { returnTo: `/routines/${routineId}` } }"
              class="text-xs text-blue-600"
            >
              ＋種目を追加
            </NuxtLink>
          </div>

          <p v-if="routine.exercises.length === 0" class="text-sm text-gray-500">
            種目がまだ登録されていません
          </p>
          <ClientOnly v-else>
            <draggable
              v-model="routine.exercises"
              item-key="id"
              handle=".drag-handle"
              class="space-y-1"
              @end="onDragEnd"
            >
              <template #item="{ element }">
                <div class="flex items-center justify-between rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
                  <span class="flex items-center gap-2">
                    <span class="drag-handle cursor-grab text-gray-400">⠿</span>
                    {{ element.exercise.name }}
                    <span class="text-xs text-gray-400">（{{ muscleGroupLabel(element.exercise.muscleGroup) }}）</span>
                  </span>
                  <button type="button" class="text-xs text-red-600" @click="removeExercise(element.id)">
                    削除
                  </button>
                </div>
              </template>
            </draggable>
          </ClientOnly>
          <p v-if="exerciseError" class="mt-2 text-sm text-red-600">{{ exerciseError }}</p>
        </div>

        <div class="rounded-lg bg-white p-4 shadow">
          <button
            v-if="!confirmingDelete"
            type="button"
            class="text-sm text-red-600"
            @click="confirmingDelete = true"
          >
            このルーティンを削除する
          </button>
          <div v-else class="flex flex-col gap-2">
            <p class="text-sm text-gray-700">本当に削除しますか？（元に戻せません）</p>
            <div class="flex gap-2">
              <button
                type="button"
                class="flex-1 rounded border border-gray-300 py-1.5 text-sm text-gray-700"
                @click="confirmingDelete = false"
              >
                キャンセル
              </button>
              <button
                type="button"
                :disabled="deleting"
                class="flex-1 rounded bg-red-600 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                @click="onDelete"
              >
                削除する
              </button>
            </div>
            <p v-if="deleteError" class="text-sm text-red-600">{{ deleteError }}</p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
