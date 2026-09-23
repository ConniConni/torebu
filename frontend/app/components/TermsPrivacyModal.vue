<!--
  新規登録画面から利用規約・プライバシーポリシーを確認するための全画面モーダル(Issue #189)。
  従来はページ遷移(target="_blank"で別タブ)だったが、別タブが開けない環境では同一タブでの
  フルページ遷移になり、登録フォームの入力内容・同意チェック状態が失われて登録できなくなる不具合が
  あった。ページ遷移自体をなくすことで新規タブの可否に依存しない構成にする。
  本文はTermsContent.vue/PrivacyContent.vue（/terms・/privacyページと共用）。
  全画面シート・背景スクロールロックの実装はMuscleHighlightSheet.vueに倣った
-->
<script setup lang="ts">
const props = defineProps<{
  type: 'terms' | 'privacy'
}>()

const emit = defineEmits<{ close: [] }>()

let previousHtmlOverflow = ''
let previousBodyOverflow = ''
onMounted(() => {
  previousHtmlOverflow = document.documentElement.style.overflow
  previousBodyOverflow = document.body.style.overflow
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.documentElement.style.overflow = previousHtmlOverflow
  document.body.style.overflow = previousBodyOverflow
})

const title = computed(() => (props.type === 'terms' ? '利用規約' : 'プライバシーポリシー'))
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-white dark:bg-panel">
    <div class="flex items-center gap-3 border-b border-gray-200 dark:border-border-dark px-4 py-3">
      <button
        type="button"
        class="text-lg text-gray-500 dark:text-muted"
        aria-label="閉じる"
        @click="emit('close')"
      >
        ✕
      </button>
      <h2 class="truncate text-sm font-semibold text-gray-900 dark:text-ink">{{ title }}</h2>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-6">
      <div class="mx-auto max-w-2xl">
        <TermsContent v-if="type === 'terms'" />
        <PrivacyContent v-else />
      </div>
    </div>

    <div class="border-t border-gray-200 dark:border-border-dark px-4 py-3">
      <button
        type="button"
        class="w-full rounded bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        @click="emit('close')"
      >
        閉じる
      </button>
    </div>
  </div>
</template>
