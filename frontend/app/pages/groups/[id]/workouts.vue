<script setup lang="ts">
// Phase4: グループメンバーの記録フィード。所属メンバー全員(本人含む)の記録を新しい順に表示する
// カードの見せ方は複数案を比較した上で「SNSタイムライン型」（名前・日付＋種目チップ）に決定。
// 種目チップはアコーディオン式（タップでセットの重量・回数を展開）にした。企画メモ（Artifact）で
// 比較した案のうち、フィード上でカードの高さを揃えたまま気になった種目だけ見られる案2を採用（2026-09-08）
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const groupId = route.params.id as string

const { fetchGroupWorkouts, likeWorkout, unlikeWorkout } = useGroups()

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

// 展開中の種目を`${workoutId}:${exerciseId}`のキーで管理する。初期状態は全て閉じている
const openExercises = ref(new Set<string>())

function exerciseKey(workoutId: string, exerciseId: string) {
  return `${workoutId}:${exerciseId}`
}

function toggleExercise(workoutId: string, exerciseId: string) {
  const key = exerciseKey(workoutId, exerciseId)
  const next = new Set(openExercises.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  openExercises.value = next
}

function isExerciseOpen(workoutId: string, exerciseId: string) {
  return openExercises.value.has(exerciseKey(workoutId, exerciseId))
}

// 連打による二重リクエスト・表示の一時的な不整合を防ぐため、通信中のworkoutIdを持っておく
const likePending = ref(new Set<string>())

async function toggleLike(workout: NonNullable<typeof workouts.value>[number]) {
  if (likePending.value.has(workout.id)) return
  likePending.value = new Set(likePending.value).add(workout.id)

  try {
    const result = workout.reactedByMe
      ? await unlikeWorkout(workout.id)
      : await likeWorkout(workout.id)
    workout.reactionCount = result.reactionCount
    workout.reactedByMe = result.reactedByMe
  } catch {
    // 通信失敗時は表示をそのまま(次の操作やリロードで再度整合を取る)。専用のエラー表示は今回は設けない
  } finally {
    const next = new Set(likePending.value)
    next.delete(workout.id)
    likePending.value = next
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <NuxtLink :to="`/groups/${groupId}`" class="text-sm text-gray-500"
          >← グループに戻る</NuxtLink
        >
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
          <div class="flex items-center gap-2.5">
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
            >
              {{ workout.displayName.slice(0, 1) }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-gray-900">{{ workout.displayName }}</p>
              <p class="text-xs text-gray-500">{{ workout.performedAt }}</p>
            </div>
          </div>
          <p v-if="workout.memo" class="mt-2 text-xs text-gray-500">{{ workout.memo }}</p>

          <p v-if="workout.exercises.length === 0" class="mt-2 text-xs text-gray-400">
            記録内容はまだありません
          </p>
          <div v-else class="mt-3 flex flex-wrap gap-1.5">
            <div v-for="ex in workout.exercises" :key="ex.exerciseId" class="w-full">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
                :aria-expanded="isExerciseOpen(workout.id, ex.exerciseId)"
                @click="toggleExercise(workout.id, ex.exerciseId)"
              >
                {{ ex.name }}・{{ ex.sets.length }}セット
                <span
                  class="text-[10px] transition-transform"
                  :class="isExerciseOpen(workout.id, ex.exerciseId) ? 'rotate-180' : ''"
                >
                  ▾
                </span>
              </button>

              <!-- セット表示は②ホームの記録カードと同じグリッド表形式に揃える(frontend/app/pages/index.vue参照) -->
              <div v-if="isExerciseOpen(workout.id, ex.exerciseId)" class="mt-1.5 overflow-x-auto">
                <div class="min-w-[15rem] overflow-hidden rounded-lg">
                  <div
                    class="grid grid-cols-[2.75rem_minmax(4rem,1.15fr)_minmax(3rem,0.85fr)] gap-x-2.5 bg-gray-100 px-3 py-1"
                  >
                    <span class="text-xs font-semibold text-gray-500">セット</span>
                    <span class="text-xs font-semibold text-gray-500">重量</span>
                    <span class="text-xs font-semibold text-gray-500">回数</span>
                  </div>
                  <div
                    v-for="(set, i) in ex.sets"
                    :key="set.id"
                    class="grid grid-cols-[2.75rem_minmax(4rem,1.15fr)_minmax(3rem,0.85fr)] items-center gap-x-2.5 px-3 py-1"
                    :class="i % 2 === 1 ? 'bg-gray-50' : ''"
                  >
                    <span class="text-center text-sm font-bold tabular-nums text-gray-900">
                      {{ set.setOrder }}
                    </span>
                    <span class="flex min-w-0 items-baseline justify-end gap-1">
                      <span class="min-w-0 truncate text-right text-sm tabular-nums text-gray-900">
                        {{ set.weightKg ?? '自重' }}
                      </span>
                      <span v-if="set.weightKg !== null" class="shrink-0 text-xs text-gray-500">
                        kg
                      </span>
                    </span>
                    <span class="flex min-w-0 items-baseline justify-end gap-1">
                      <span class="min-w-0 truncate text-right text-sm tabular-nums text-gray-900">
                        {{ set.reps }}
                      </span>
                      <span class="shrink-0 text-xs text-gray-500">回</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-3 flex items-center border-t border-gray-100 pt-2.5">
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium transition-colors"
              :class="
                workout.reactedByMe
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-500 hover:bg-gray-100'
              "
              :disabled="likePending.has(workout.id)"
              :aria-pressed="workout.reactedByMe"
              @click="toggleLike(workout)"
            >
              <HeartIcon :filled="workout.reactedByMe" class="h-4 w-4" />
              <span v-if="workout.reactionCount > 0" class="tabular-nums">
                {{ workout.reactionCount }}
              </span>
              <span v-else>いいね</span>
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
