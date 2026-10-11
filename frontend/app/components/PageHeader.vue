<!--
  「← ◯◯に戻る」＋画面タイトルの共通ヘッダー（Issue参照：docs/backlog.md
  「戻るリンクが常にスクロールで流れる」）。sticky指定で画面上部に固定し、
  ランキング・ワークアウト一覧等の長いページでも戻る手段が常に見えるようにする。
  backToを渡せばNuxtLink、渡さなければbackクリックをemitするbuttonになる
  （workouts/new.vueのように離脱前に保存を待つ必要がある画面向け）。
  busyを渡すと、待ち中であることを示すスピナー付き表示になり、二重クリックも防ぐ。
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

withDefaults(
  defineProps<{
    backTo?: RouteLocationRaw
    backLabel: string
    title?: string
    busy?: boolean
  }>(),
  { backTo: undefined, title: undefined, busy: false },
)

defineEmits<{ back: [] }>()
</script>

<template>
  <div class="sticky top-0 z-10 bg-gray-50 dark:bg-surface px-4 pb-3 pt-6">
    <div class="mx-auto flex max-w-sm items-center justify-between">
      <NuxtLink v-if="backTo" :to="backTo" class="text-sm text-gray-500 dark:text-muted">
        ← {{ backLabel }}
      </NuxtLink>
      <button
        v-else
        type="button"
        :disabled="busy"
        class="flex items-center gap-1 text-sm text-gray-500 dark:text-muted"
        @click="$emit('back')"
      >
        <template v-if="busy">
          <ArrowPathIcon class="h-4 w-4 animate-spin" />
          保存を待っています...
        </template>
        <template v-else>← {{ backLabel }}</template>
      </button>
      <h1 v-if="title" class="text-base font-semibold text-gray-900 dark:text-ink">{{ title }}</h1>
    </div>
  </div>
</template>
