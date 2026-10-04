<!--
  カスタム種目の追加は今後の有料オプションとする方針（Issue #330）の案内。
  ④種目選択の「＋種目を追加」から開く小さなダイアログ。⑦種目追加（exercises-new）でも
  同じ文言を使うため、文言はこのコンポーネントに集約している。
  課金の実装前なので、案内を出すだけで何も作成・遷移しない
-->
<script setup lang="ts">
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
    role="dialog"
    aria-modal="true"
    aria-labelledby="paid-option-notice-title"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg dark:bg-panel">
      <h2 id="paid-option-notice-title" class="text-base font-semibold text-gray-900 dark:text-ink">
        種目の追加は、今後の有料オプションです
      </h2>
      <p class="mt-2 text-sm leading-relaxed text-gray-700 dark:text-muted">
        オリジナルの種目の追加は、今後、有料オプションとして追加できるようになる予定です。
        いま登録されている種目から選んで、これまでどおり記録できます。
      </p>
      <button
        type="button"
        class="mt-4 w-full rounded bg-brand-600 py-2 text-sm font-semibold text-white dark:bg-accent dark:text-surface"
        @click="emit('close')"
      >
        閉じる
      </button>
    </div>
  </div>
</template>
