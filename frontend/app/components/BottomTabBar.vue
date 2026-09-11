<!--
  主ナビゲーション用の下部固定タブバー（Issue #174）。ホーム／ルーティン／統計／グループの4タブと
  中央FAB「＋記録」を持つ。対象はこの4画面のみで、`layouts/tabbar.vue`から使う
  （詳細はdocs/backlog.md「ナビゲーションのタブバー化」参照）。
  タブからの遷移は`returnTo`を持たない単純な画面切り替え（③④⑤⑦等のreturnTo設計には手を入れない）。
-->
<script setup lang="ts">
// TABS配列内でコンポーネントを識別子として参照するため、テンプレート内使用のみで効く
// 自動importに頼らず明示的にimportする
import GroupIcon from '~/components/GroupIcon.vue'
import HomeIcon from '~/components/HomeIcon.vue'
import RoutineIcon from '~/components/RoutineIcon.vue'
import StatsIcon from '~/components/StatsIcon.vue'

const route = useRoute()

const TABS = [
  { to: '/', label: 'ホーム', icon: HomeIcon },
  { to: '/routines', label: 'ルーティン', icon: RoutineIcon },
  { to: '/stats', label: '統計', icon: StatsIcon },
  { to: '/groups', label: 'グループ', icon: GroupIcon },
] as const

// グループ詳細配下（/groups/xxx）等の子画面はこのタブバー自体の表示対象外だが、
// 保険としてprefixで判定しておく（今のところ完全一致のみ使われる想定）
function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]"
    aria-label="主ナビゲーション"
  >
    <div class="relative mx-auto flex max-w-sm items-center justify-between px-2">
      <NuxtLink
        v-for="tab in TABS"
        :key="tab.to"
        :to="tab.to"
        class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold"
        :class="isActive(tab.to) ? 'text-brand-700' : 'text-gray-400'"
        :aria-current="isActive(tab.to) ? 'page' : undefined"
      >
        <component :is="tab.icon" class="h-5 w-5" />
        {{ tab.label }}
      </NuxtLink>

      <button
        type="button"
        class="absolute left-1/2 -top-5 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700"
        aria-label="記録を追加"
        @click="navigateTo('/workouts/new')"
      >
        <PlusIcon class="h-6 w-6" />
      </button>
    </div>
  </nav>
</template>
