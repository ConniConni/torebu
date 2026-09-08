<script setup lang="ts">
// ④ 種目選択。部位ごとにセクション分けし、各セクション上位5件＋開閉トグルで全件表示
// ③記録作成・⑤ルーティン編集の両方から遷移してくる共通画面。選択後にどこへ戻るかは
// クエリパラメータreturnTo(未指定なら③記録作成)で決める
import type { Exercise } from '~/composables/useExercises'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const returnTo = computed(() =>
  typeof route.query.returnTo === 'string' ? route.query.returnTo : '/workouts/new',
)

const { exercises, pending, error, fetchExercises, deleteExercise } = useExercises()
if (!exercises.value) {
  await fetchExercises()
}
const { user } = useAuth()

const SECTION_PREVIEW_COUNT = 5
const expandedGroups = ref<Set<MuscleGroup>>(new Set())

const sections = computed(() =>
  MUSCLE_GROUPS.map((group) => ({
    group,
    label: muscleGroupLabel(group),
    // 削除済み(ソフトデリート)の種目は新規の記録には選べないため一覧から除外する(Issue #113)
    exercises: (exercises.value ?? []).filter((e) => e.muscleGroup === group && !e.deletedAt),
  })),
)

function visibleExercises(section: (typeof sections.value)[number]) {
  return expandedGroups.value.has(section.group)
    ? section.exercises
    : section.exercises.slice(0, SECTION_PREVIEW_COUNT)
}

function toggleExpanded(group: MuscleGroup) {
  const next = new Set(expandedGroups.value)
  if (next.has(group)) {
    next.delete(group)
  } else {
    next.add(group)
  }
  expandedGroups.value = next
}

async function selectExercise(exerciseId: string) {
  usePickedExerciseId().value = exerciseId
  await navigateTo(returnTo.value)
}

// 部位ハイライトシート(Issue #106)。選択中はnull以外になり、シートを表示する
const highlightExercise = ref<Exercise | null>(null)

// カスタム種目の削除(Issue #113)。作成者本人の行にのみ削除ボタンを出す。
// ⑤ルーティン一覧の本体削除(routines/index.vue)と同じ「アイコンで確認へ切替→2段階確認」UI
function canDelete(exercise: Exercise) {
  return exercise.createdBy !== null && exercise.createdBy === user.value?.id
}
const confirmingDeleteId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const deleteError = ref('')

async function onDeleteExercise(id: string) {
  deletingId.value = id
  deleteError.value = ''
  try {
    await deleteExercise(id)
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
      <NuxtLink :to="returnTo" class="text-sm text-gray-500">← 戻る</NuxtLink>
      <h1 class="text-base font-semibold text-gray-900">種目を選択</h1>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="error" class="text-center text-sm text-red-600">
        種目一覧の取得に失敗しました。時間をおいて再度お試しください
      </p>

      <template v-else>
        <section v-for="section in sections" :key="section.group" class="rounded-lg bg-white p-4 shadow">
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-gray-900">{{ section.label }}</h2>
            <NuxtLink
              :to="{ path: '/workouts/exercises-new', query: { muscleGroup: section.group, returnTo } }"
              class="text-xs text-blue-600"
            >
              ＋種目を追加
            </NuxtLink>
          </div>

          <p v-if="section.exercises.length === 0" class="text-sm text-gray-500">種目がありません</p>
          <ul v-else class="space-y-1">
            <li v-for="exercise in visibleExercises(section)" :key="exercise.id">
              <div v-if="confirmingDeleteId === exercise.id" class="flex flex-col gap-2 rounded bg-gray-50 p-2">
                <p class="text-sm text-gray-700">
                  「{{ exercise.name }}」を削除しますか？（元に戻せません）今後この種目は選べなくなりますが、これまでの記録・ルーティンはそのまま残ります
                </p>
                <div class="flex gap-2">
                  <button
                    type="button"
                    :disabled="deletingId === exercise.id"
                    class="flex-1 rounded border border-gray-300 py-1.5 text-sm text-gray-700 disabled:opacity-50"
                    @click="confirmingDeleteId = null"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    :disabled="deletingId === exercise.id"
                    class="flex-1 rounded bg-red-600 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    @click="onDeleteExercise(exercise.id)"
                  >
                    {{ deletingId === exercise.id ? '削除中...' : '削除する' }}
                  </button>
                </div>
                <p v-if="deleteError" class="text-sm text-red-600">{{ deleteError }}</p>
              </div>
              <div v-else class="flex items-center gap-1">
                <button
                  type="button"
                  class="flex-1 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
                  @click="selectExercise(exercise.id)"
                >
                  {{ exercise.name }}
                </button>
                <button
                  type="button"
                  class="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label="この種目が効く部位を見る"
                  @click="highlightExercise = exercise"
                >
                  <InfoIcon class="h-4 w-4" />
                </button>
                <button
                  v-if="canDelete(exercise)"
                  type="button"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600"
                  aria-label="この種目を削除する"
                  @click="confirmingDeleteId = exercise.id"
                >
                  <TrashIcon class="h-4 w-4" />
                </button>
              </div>
            </li>
          </ul>

          <button
            v-if="section.exercises.length > SECTION_PREVIEW_COUNT"
            type="button"
            class="mt-1 flex items-center gap-1 text-xs text-gray-500"
            @click="toggleExpanded(section.group)"
          >
            {{ expandedGroups.has(section.group) ? '閉じる' : `もっと見る（他${section.exercises.length - SECTION_PREVIEW_COUNT}件）` }}
            <ChevronDownIcon
              class="h-3.5 w-3.5 transition-transform"
              :class="expandedGroups.has(section.group) ? 'rotate-180' : ''"
            />
          </button>
        </section>
      </template>
    </div>

    <MuscleHighlightSheet
      v-if="highlightExercise"
      :exercise-name="highlightExercise.name"
      :main-muscle="highlightExercise.mainMuscle"
      :related-muscles="highlightExercise.relatedMuscles"
      :main-zone="highlightExercise.mainZone"
      @close="highlightExercise = null"
    />
  </div>
</template>
