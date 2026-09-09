<script setup lang="ts">
// Phase4: グループメンバーの記録フィード。所属メンバー全員(本人含む)の記録を新しい順に表示する
// カードの見せ方は複数案を比較した上で「SNSタイムライン型」（名前・日付＋種目チップ）に決定。
// 種目チップはアコーディオン式（タップでセットの重量・回数を展開）にした。企画メモ（Artifact）で
// 比較した案のうち、フィード上でカードの高さを揃えたまま気になった種目だけ見られる案2を採用（2026-09-08）
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const groupId = route.params.id as string

const {
  fetchGroupWorkouts,
  likeWorkout,
  unlikeWorkout,
  fetchComments,
  postComment,
  deleteComment,
} = useGroups()
const { user } = useAuth()

function isOwnWorkout(workout: { userId: string }) {
  return workout.userId === user.value?.id
}

// 自分の記録のいいねボタンは「いいねしてくれた人の一覧を開く」専用にする(#149)。
// 自分の記録にはいいねできない(トグル操作自体が無い)ため、同じボタンにトグルと一覧表示の
// 2つの役割を持たせても意味が衝突しない
const openReactorWorkoutIds = ref(new Set<string>())

function isReactorsOpen(workoutId: string) {
  return openReactorWorkoutIds.value.has(workoutId)
}

function toggleReactorsPanel(workoutId: string) {
  const next = new Set(openReactorWorkoutIds.value)
  if (next.has(workoutId)) {
    next.delete(workoutId)
  } else {
    next.add(workoutId)
  }
  openReactorWorkoutIds.value = next
}

type WorkoutComment = Awaited<ReturnType<typeof fetchComments>>[number]

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

// 通知一覧（/notifications）からの遷移(?workout=<id>)で使う対象workoutId。
// コメント欄を開く・カードをハイライトする実処理は、それらに必要な状態・関数が揃うスクリプト末尾で行う
const highlightWorkoutId = route.query.workout as string | undefined

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

// 他人の記録のみが対象(自分の記録はtoggleReactorsPanelを使う。バックエンドも自分の記録への
// いいねは400を返す)
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

// コメント(Phase4)。展開時に遅延取得する(一覧APIには件数のみ含まれる)
const openCommentWorkoutIds = ref(new Set<string>())
const commentsByWorkoutId = ref(new Map<string, WorkoutComment[]>())
const commentLoadError = ref(new Set<string>())
const commentInputs = ref(new Map<string, string>())
const commentPosting = ref(new Set<string>())
const commentDeleting = ref(new Set<string>())

function isCommentsOpen(workoutId: string) {
  return openCommentWorkoutIds.value.has(workoutId)
}

function onCommentInput(workoutId: string, value: string) {
  const next = new Map(commentInputs.value)
  next.set(workoutId, value)
  commentInputs.value = next
}

// 日本語入力の変換確定Enterで誤送信しないよう、IME変換中(isComposing)のEnterは無視する。
// 変換確定後、改めてEnterを押したときだけ送信される（一般的なチャットアプリと同じ挙動）
function onCommentEnter(event: KeyboardEvent, workout: NonNullable<typeof workouts.value>[number]) {
  if (event.isComposing) return
  onPostComment(workout)
}

async function toggleComments(workoutId: string) {
  const next = new Set(openCommentWorkoutIds.value)
  if (next.has(workoutId)) {
    next.delete(workoutId)
    openCommentWorkoutIds.value = next
    return
  }
  next.add(workoutId)
  openCommentWorkoutIds.value = next

  if (commentsByWorkoutId.value.has(workoutId)) return
  const errors = new Set(commentLoadError.value)
  errors.delete(workoutId)
  commentLoadError.value = errors
  try {
    const comments = await fetchComments(workoutId)
    const map = new Map(commentsByWorkoutId.value)
    map.set(workoutId, comments)
    commentsByWorkoutId.value = map
  } catch {
    const nextErrors = new Set(commentLoadError.value)
    nextErrors.add(workoutId)
    commentLoadError.value = nextErrors
  }
}

async function onPostComment(workout: NonNullable<typeof workouts.value>[number]) {
  const body = (commentInputs.value.get(workout.id) ?? '').trim()
  if (!body || commentPosting.value.has(workout.id)) return

  const posting = new Set(commentPosting.value)
  posting.add(workout.id)
  commentPosting.value = posting
  try {
    const comment = await postComment(workout.id, body)
    const map = new Map(commentsByWorkoutId.value)
    map.set(workout.id, [...(map.get(workout.id) ?? []), comment])
    commentsByWorkoutId.value = map
    workout.commentCount += 1

    const inputs = new Map(commentInputs.value)
    inputs.set(workout.id, '')
    commentInputs.value = inputs
  } catch {
    // 通信失敗時は入力内容を残す(再送信できるように)。専用のエラー表示は今回は設けない
  } finally {
    const next = new Set(commentPosting.value)
    next.delete(workout.id)
    commentPosting.value = next
  }
}

async function onDeleteComment(
  workout: NonNullable<typeof workouts.value>[number],
  comment: WorkoutComment,
) {
  if (commentDeleting.value.has(comment.id)) return
  const deleting = new Set(commentDeleting.value)
  deleting.add(comment.id)
  commentDeleting.value = deleting
  try {
    await deleteComment(workout.id, comment.id)
    const map = new Map(commentsByWorkoutId.value)
    map.set(
      workout.id,
      (map.get(workout.id) ?? []).filter((c) => c.id !== comment.id),
    )
    commentsByWorkoutId.value = map
    workout.commentCount = Math.max(0, workout.commentCount - 1)
  } catch {
    // 通信失敗時は表示をそのまま。専用のエラー表示は今回は設けない
  } finally {
    const next = new Set(commentDeleting.value)
    next.delete(comment.id)
    commentDeleting.value = next
  }
}

// 通知一覧（/notifications）からの遷移(?workout=<id>)は、対象カードまでスクロールし
// コメント欄を開いた状態で表示する。読み込み後に一度だけ行う（一覧の並びは変わらないため）
if (highlightWorkoutId && workouts.value?.some((w) => w.id === highlightWorkoutId)) {
  await toggleComments(highlightWorkoutId)
  nextTick(() => {
    document.getElementById(`workout-${highlightWorkoutId}`)?.scrollIntoView({ block: 'center' })
  })
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
        <li
          v-for="workout in workouts"
          :id="`workout-${workout.id}`"
          :key="workout.id"
          class="rounded-lg bg-white p-4 shadow"
          :class="workout.id === highlightWorkoutId ? 'ring-2 ring-brand-400' : ''"
        >
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

          <div class="mt-3 flex items-center gap-1 border-t border-gray-100 pt-2.5">
            <!-- 自分の記録：いいねボタンは押せず(トグル無し)、いいねしてくれた人の一覧を開閉する専用ボタンになる(#149) -->
            <button
              v-if="isOwnWorkout(workout)"
              type="button"
              class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium transition-colors"
              :class="
                isReactorsOpen(workout.id)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-500 hover:bg-gray-100'
              "
              :aria-expanded="isReactorsOpen(workout.id)"
              @click="toggleReactorsPanel(workout.id)"
            >
              <HeartIcon :filled="workout.reactionCount > 0" class="h-4 w-4" />
              <span class="tabular-nums">{{ workout.reactionCount }}</span>
            </button>
            <button
              v-else
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
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100"
              :aria-expanded="isCommentsOpen(workout.id)"
              @click="toggleComments(workout.id)"
            >
              <CommentIcon class="h-4 w-4" />
              <span v-if="workout.commentCount > 0" class="tabular-nums">
                {{ workout.commentCount }}
              </span>
              <span v-else>コメント</span>
            </button>
          </div>

          <!-- いいねしてくれた人の一覧(#149)。自分の記録でのみ開ける -->
          <div
            v-if="isOwnWorkout(workout) && isReactorsOpen(workout.id)"
            class="mt-2.5 border-t border-gray-100 pt-2.5"
          >
            <p v-if="workout.reactorNames.length === 0" class="text-xs text-gray-500">
              まだいいねがありません
            </p>
            <ul v-else class="flex flex-col gap-2">
              <li
                v-for="(name, i) in workout.reactorNames"
                :key="`${workout.id}-${i}`"
                class="flex items-center gap-2"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700"
                >
                  {{ name.slice(0, 1) }}
                </span>
                <span class="text-sm text-gray-700">{{ name }}</span>
              </li>
            </ul>
          </div>

          <div v-if="isCommentsOpen(workout.id)" class="mt-2.5 border-t border-gray-100 pt-2.5">
            <p v-if="commentLoadError.has(workout.id)" class="text-xs text-red-600">
              コメントの取得に失敗しました。時間をおいて再度お試しください
            </p>
            <p v-else-if="!commentsByWorkoutId.has(workout.id)" class="text-xs text-gray-500">
              読み込み中...
            </p>
            <ul v-else class="flex flex-col gap-2">
              <li
                v-for="comment in commentsByWorkoutId.get(workout.id)"
                :key="comment.id"
                class="flex items-start gap-2"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700"
                >
                  {{ comment.displayName.slice(0, 1) }}
                </span>
                <div class="min-w-0 flex-1">
                  <div
                    class="rounded-lg px-2.5 py-1.5"
                    :class="comment.userId === user?.id ? 'bg-brand-50' : 'bg-gray-100'"
                  >
                    <p
                      class="text-xs font-medium"
                      :class="comment.userId === user?.id ? 'text-brand-700' : 'text-gray-600'"
                    >
                      {{ comment.displayName }}{{ comment.userId === user?.id ? '（自分）' : '' }}
                    </p>
                    <p class="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-900">
                      {{ comment.body }}
                    </p>
                  </div>
                </div>
                <button
                  v-if="comment.userId === user?.id"
                  type="button"
                  class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600"
                  aria-label="このコメントを削除"
                  :disabled="commentDeleting.has(comment.id)"
                  @click="onDeleteComment(workout, comment)"
                >
                  <TrashIcon class="h-3 w-3" />
                </button>
              </li>
              <li
                v-if="commentsByWorkoutId.get(workout.id)?.length === 0"
                class="text-xs text-gray-500"
              >
                まだコメントがありません
              </li>
            </ul>

            <div class="mt-2 flex gap-1.5">
              <input
                :value="commentInputs.get(workout.id) ?? ''"
                type="text"
                placeholder="コメントを入力"
                maxlength="500"
                class="h-[34px] min-w-0 flex-1 rounded-full border border-gray-300 px-3 text-sm"
                @input="onCommentInput(workout.id, ($event.target as HTMLInputElement).value)"
                @keydown.enter="onCommentEnter($event, workout)"
              />
              <button
                type="button"
                class="h-[34px] shrink-0 rounded-full bg-brand-600 px-3.5 text-sm font-semibold text-white disabled:opacity-50"
                :disabled="
                  commentPosting.has(workout.id) || !(commentInputs.get(workout.id) ?? '').trim()
                "
                @click="onPostComment(workout)"
              >
                送信
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
