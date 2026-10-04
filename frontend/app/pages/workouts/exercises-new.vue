<script setup lang="ts">
// ⑦ 種目追加。カスタム種目の追加は今後の有料オプションとする方針のため（Issue #330）、
// 作成フォームは出さず、④種目選択へ戻る案内だけを表示する。④の「＋種目を追加」は
// このページへ遷移しなくなったが、ブックマーク等の直リンクで開かれても同じ案内になる。
// 課金の実装時に、フォーム（git履歴のIssue #330以前のexercises-new.vue）を復活させる。
// 戻り先はクエリパラメータreturnTo(未指定なら③記録作成)を④へ引き継ぐ
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const returnTo = computed(() =>
  typeof route.query.returnTo === 'string' ? route.query.returnTo : '/workouts/new',
)
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-surface">
    <PageHeader
      :back-to="{ path: '/workouts/exercises', query: { returnTo } }"
      back-label="種目選択に戻る"
      title="種目を追加"
    />
    <div class="px-4 pb-6">
      <div class="mx-auto flex max-w-sm flex-col gap-4">
        <div class="rounded-lg bg-white p-4 shadow dark:bg-panel">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-ink">準備中</h2>
          <p class="mt-2 text-sm text-gray-700 dark:text-muted">有料オプションで追加予定です。</p>
        </div>
        <NuxtLink
          :to="{ path: '/workouts/exercises', query: { returnTo } }"
          class="block w-full rounded bg-brand-600 py-2 text-center text-sm font-semibold text-white dark:bg-accent dark:text-surface"
        >
          種目選択に戻る
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
