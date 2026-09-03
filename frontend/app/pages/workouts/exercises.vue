<script setup lang="ts">
// ④ 種目選択。部位ごとにセクション分けし、各セクション上位5件＋開閉トグルで全件表示
definePageMeta({ middleware: 'auth' })

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
  await navigateTo('/workouts/new')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <NuxtLink to="/workouts/new" class="text-sm text-gray-500">← 記録作成に戻る</NuxtLink>
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
              :to="{ path: '/workouts/exercises-new', query: { muscleGroup: section.group } }"
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
            class="mt-1 flex w-full items-center justify-center gap-1 rounded py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
            @click="toggleExpanded(section.group)"
          >
            {{
              expandedGroups.has(section.group)
                ? '閉じる'
                : `他${section.exercises.length - SECTION_PREVIEW_COUNT}件を表示`
            }}
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              class="h-4 w-4 transition-transform duration-200"
              :class="{ 'rotate-180': expandedGroups.has(section.group) }"
            >
              <path
                fill-rule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.293l3.71-4.06a.75.75 0 111.08 1.04l-4.25 4.65a.75.75 0 01-1.08 0l-4.25-4.65a.75.75 0 01.02-1.06z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </section>
      </template>
    </div>
  </div>
</template>
