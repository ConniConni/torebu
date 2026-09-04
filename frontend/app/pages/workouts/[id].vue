<script setup lang="ts">
// ⑥ 記録詳細。過去1回分のworkout(日付・メモ)＋workout_sets(種目ごとのセット)を見返す・編集する画面
definePageMeta({ middleware: 'auth' })

interface WorkoutSet {
  id: string
  workoutId: string
  exerciseId: string
  setOrder: number
  weightKg: number | null
  reps: number
}
interface WorkoutDetail {
  id: string
  performedAt: string
  memo: string | null
  createdAt: string
  updatedAt: string
  sets: WorkoutSet[]
}

const route = useRoute()
const router = useRouter()
const workoutId = route.params.id as string
const requestFetch = useRequestFetch()

const { exercises, fetchExercises } = useExercises()
if (!exercises.value) {
  await fetchExercises()
}

const workout = ref<WorkoutDetail | null>(null)
const pending = ref(false)
const error = ref(false)

async function fetchWorkout() {
  pending.value = true
  error.value = false
  try {
    workout.value = await requestFetch<WorkoutDetail>(`/api/workouts/${workoutId}`)
  } catch {
    error.value = true
  } finally {
    pending.value = false
  }
}
await fetchWorkout()

function exerciseName(exerciseId: string) {
  return exercises.value?.find((e) => e.id === exerciseId)?.name ?? '(不明な種目)'
}

// workouts/new.vueと同じ方針：種目ごとにグルーピングし、セット順に並べて表示する
const groupedSets = computed(() => {
  if (!workout.value) return []
  const byExercise = new Map<string, WorkoutSet[]>()
  for (const set of workout.value.sets) {
    byExercise.set(set.exerciseId, [...(byExercise.get(set.exerciseId) ?? []), set])
  }
  return [...byExercise.entries()].map(([exerciseId, sets]) => ({
    exerciseId,
    name: exerciseName(exerciseId),
    sets: [...sets].sort((a, b) => a.setOrder - b.setOrder),
  }))
})

// --- メモの編集 ---
// 記録日(performedAt)は編集不可(意図的)：③「今日の記録を始める」が「同じ日付のworkoutが
// あれば再開する」という日付ベースの引き当てをしているため、記録日を後から動かせると
// 「移動先の元の日付で記録を始めようとした際に、行き場を失った古い日付の分と合わせて
// 記録が実質二重になる」事故につながる(docs/backlog.md参照)。バックエンドAPIも合わせて
// performedAtの更新を受け付けない
const memoInput = ref(workout.value?.memo ?? '')
const detailSaving = ref(false)
const detailError = ref('')

async function onSaveDetail() {
  if (!workout.value) return
  detailSaving.value = true
  detailError.value = ''
  try {
    workout.value = {
      ...workout.value,
      ...(await requestFetch<WorkoutDetail>(`/api/workouts/${workoutId}`, {
        method: 'PATCH',
        body: { memo: memoInput.value.trim() },
      })),
    }
  } catch {
    detailError.value = '記録の更新に失敗しました。時間をおいて再度お試しください'
  } finally {
    detailSaving.value = false
  }
}

// --- セットの編集・削除 ---
const editingSetId = ref<string | null>(null)
const editWeightInput = ref('')
const editRepsInput = ref('')
const setSaving = ref(false)
const setError = ref('')

function onStartEditSet(set: WorkoutSet) {
  editingSetId.value = set.id
  editWeightInput.value = set.weightKg === null ? '' : String(set.weightKg)
  editRepsInput.value = String(set.reps)
  setError.value = ''
}

function onCancelEditSet() {
  editingSetId.value = null
}

async function onSaveSet() {
  if (!workout.value || !editingSetId.value) return
  const reps = Number(editRepsInput.value)
  if (!Number.isInteger(reps) || reps <= 0) return
  const weightRaw = String(editWeightInput.value).trim()
  const weightKg = weightRaw ? Number(weightRaw) : null

  setSaving.value = true
  setError.value = ''
  try {
    const updated = await requestFetch<WorkoutSet>(
      `/api/workouts/${workoutId}/sets/${editingSetId.value}`,
      { method: 'PATCH', body: { weightKg, reps } },
    )
    workout.value = {
      ...workout.value,
      sets: workout.value.sets.map((s) => (s.id === updated.id ? updated : s)),
    }
    editingSetId.value = null
  } catch {
    setError.value = 'セットの更新に失敗しました。時間をおいて再度お試しください'
  } finally {
    setSaving.value = false
  }
}

async function onDeleteSet(setId: string) {
  if (!workout.value) return
  setSaving.value = true
  setError.value = ''
  try {
    await requestFetch(`/api/workouts/${workoutId}/sets/${setId}`, { method: 'DELETE' })
    workout.value = { ...workout.value, sets: workout.value.sets.filter((s) => s.id !== setId) }
    if (editingSetId.value === setId) editingSetId.value = null
  } catch {
    setError.value = 'セットの削除に失敗しました。時間をおいて再度お試しください'
  } finally {
    setSaving.value = false
  }
}

// --- 記録全体の削除 ---
// window.confirm()は「このページに追加のダイアログを表示させない」でブラウザ側から無効化されうる
// (docs/backlog.md参照)ため、画面内の2段階確認(確認表示→実行ボタン)にする
const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')

async function onDeleteWorkout() {
  deleting.value = true
  deleteError.value = ''
  try {
    await requestFetch(`/api/workouts/${workoutId}`, { method: 'DELETE' })
    await router.push('/')
  } catch {
    deleteError.value = '記録の削除に失敗しました。時間をおいて再度お試しください'
    deleting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <NuxtLink to="/" class="text-sm text-gray-500">← ホームに戻る</NuxtLink>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error || !workout" class="text-center text-sm text-red-600">
        記録の取得に失敗しました。時間をおいて再度お試しください
      </p>

      <template v-else>
        <section class="rounded-lg bg-white p-4 shadow">
          <p class="text-sm text-gray-700">
            記録日
            <span class="ml-1 font-semibold text-gray-900">{{ workout.performedAt }}</span>
          </p>
          <label class="mt-2 flex flex-col gap-1 text-sm text-gray-700">
            メモ
            <textarea
              v-model="memoInput"
              rows="2"
              maxlength="500"
              placeholder="メモ無し"
              class="rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            :disabled="detailSaving"
            class="mt-2 rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 disabled:opacity-50"
            @click="onSaveDetail"
          >
            {{ detailSaving ? '保存中...' : 'メモを保存' }}
          </button>
          <p v-if="detailError" class="mt-2 text-sm text-red-600">{{ detailError }}</p>
        </section>

        <section
          v-for="group in groupedSets"
          :key="group.exerciseId"
          class="rounded-lg bg-white p-4 shadow"
        >
          <p class="mb-2 text-sm font-semibold text-gray-900">{{ group.name }}</p>
          <ul class="space-y-2">
            <li v-for="set in group.sets" :key="set.id" class="text-sm text-gray-700">
              <template v-if="editingSetId === set.id">
                <div class="flex items-end gap-2">
                  <label class="flex flex-1 flex-col gap-1 text-xs text-gray-500">
                    重量(kg・自重は空欄)
                    <input
                      v-model="editWeightInput"
                      type="number"
                      step="0.5"
                      min="0"
                      class="rounded border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label class="flex flex-1 flex-col gap-1 text-xs text-gray-500">
                    回数
                    <input
                      v-model="editRepsInput"
                      type="number"
                      min="1"
                      class="rounded border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <div class="mt-1 flex gap-2">
                  <button
                    type="button"
                    :disabled="!editRepsInput || setSaving"
                    class="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    @click="onSaveSet"
                  >
                    保存
                  </button>
                  <button type="button" class="text-xs text-gray-500" @click="onCancelEditSet">
                    キャンセル
                  </button>
                </div>
              </template>
              <div v-else class="flex items-center justify-between">
                <span class="flex items-baseline gap-1 tabular-nums">
                  <span
                    ><span class="inline-block w-6 text-right">{{ set.setOrder }}</span
                    >セット目：</span
                  >
                  <span>
                    <span class="inline-block w-14 text-right">{{ set.weightKg ?? '自重' }}</span
                    >{{ set.weightKg ? 'kg' : '' }}
                  </span>
                  <span>×</span>
                  <span><span class="inline-block w-6 text-right">{{ set.reps }}</span>回</span>
                </span>
                <span class="flex shrink-0 gap-2">
                  <button type="button" class="text-xs text-gray-500" @click="onStartEditSet(set)">
                    編集
                  </button>
                  <button
                    type="button"
                    :disabled="setSaving"
                    class="text-xs text-red-600 disabled:opacity-50"
                    @click="onDeleteSet(set.id)"
                  >
                    削除
                  </button>
                </span>
              </div>
            </li>
          </ul>
        </section>

        <p v-if="setError" class="text-center text-sm text-red-600">{{ setError }}</p>

        <p v-if="groupedSets.length === 0" class="text-center text-sm text-gray-500">
          この記録には種目がありません
        </p>

        <section class="rounded-lg bg-white p-4 shadow">
          <template v-if="confirmingDelete">
            <p class="text-sm text-gray-700">この記録を削除しますか？元に戻せません。</p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                :disabled="deleting"
                class="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                @click="onDeleteWorkout"
              >
                {{ deleting ? '削除中...' : '削除する' }}
              </button>
              <button
                type="button"
                :disabled="deleting"
                class="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 disabled:opacity-50"
                @click="confirmingDelete = false"
              >
                キャンセル
              </button>
            </div>
          </template>
          <button
            v-else
            type="button"
            class="w-full rounded border border-red-600 py-2 text-sm font-semibold text-red-600"
            @click="confirmingDelete = true"
          >
            この記録を削除
          </button>
          <p v-if="deleteError" class="mt-2 text-sm text-red-600">{{ deleteError }}</p>
        </section>
      </template>
    </div>
  </div>
</template>
