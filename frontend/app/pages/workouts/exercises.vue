<script setup lang="ts">
// ④ 種目選択。部位ごとにセクション分けし、各セクション上位5件＋開閉トグルで全件表示
// ③記録作成・⑤ルーティン編集の両方から遷移してくる共通画面。選択後にどこへ戻るかは
// クエリパラメータreturnTo(未指定なら③記録作成)で決める
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const returnTo = computed(() =>
  typeof route.query.returnTo === 'string' ? route.query.returnTo : '/workouts/new',
)

const { exercises, pending, error, fetchExercises } = useExercises()
if (!exercises.value) {
  await fetchExercises()
}

const SECTION_PREVIEW_COUNT = 5
const expandedGroups = ref<Set<MuscleGroup>>(new Set())

const sections = computed(() =>
  MUSCLE_GROUPS.map((group) => ({
    group,
    label: muscleGroupLabel(group),
    exercises: (exercises.value ?? []).filter((e) => e.muscleGroup === group),
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
              <button
                type="button"
                class="w-full rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
                @click="selectExercise(exercise.id)"
              >
                {{ exercise.name }}
              </button>
            </li>
          </ul>

          <button
            v-if="section.exercises.length > SECTION_PREVIEW_COUNT"
            type="button"
            class="mt-1 text-xs text-gray-500"
            @click="toggleExpanded(section.group)"
          >
            {{ expandedGroups.has(section.group) ? '閉じる' : `もっと見る（他${section.exercises.length - SECTION_PREVIEW_COUNT}件）` }}
          </button>
        </section>
      </template>
    </div>
  </div>
</template>
