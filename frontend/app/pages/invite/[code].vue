<script setup lang="ts">
// グループ招待リンクの受け口(Issue #312)。未登録・ログアウト中・ログイン中のどの人にも同じリンクを
// 送れるよう`auth`ミドルウェアは付けず、状態に応じて「新規登録/ログインして参加」「参加する」
// 「グループを開く(参加済み)」を出し分ける。ログイン・登録後は?redirectでこの画面に戻ってくる
const route = useRoute()
const inviteCode = route.params.code as string

const { user, fetchMe } = useAuth()
if (!user.value) {
  await fetchMe()
}

const { fetchInvitePreview, joinGroup } = useGroups()

// 招待リンクはLINE等で共有されるが、グループ名は招待された人にだけ見せたいため、
// OGP(リンクプレビュー)はグループ名を含まない汎用の文面にする。検索結果にも載せない
useSeoMeta({
  title: 'トレ部への招待',
  ogTitle: 'トレ部のグループに招待されています',
  ogDescription:
    '仲間と筋トレを記録・応援しあうアプリ「トレ部」。リンクを開いてグループに参加しよう。',
  ogImage: new URL('/images/og-image.jpeg', useRequestURL().origin).href,
  twitterCard: 'summary_large_image',
  robots: 'noindex, nofollow',
})

const preview = ref<Awaited<ReturnType<typeof fetchInvitePreview>> | null>(null)
const loadErrorCode = ref<string | null>(null)

try {
  preview.value = await fetchInvitePreview(inviteCode)
} catch (e) {
  loadErrorCode.value = (e as { data?: { error?: string } })?.data?.error ?? 'unknown'
}

// 「招待コードが正しくありません」等の既存の文言はコード入力欄向けのため、リンク向けに言い換える
const loadErrorMessage = computed(() => {
  switch (loadErrorCode.value) {
    case 'invalid_invite_code':
      return 'この招待リンクは無効です。グループのメンバーに新しいリンクを送ってもらってください'
    case 'invite_expired':
      return 'この招待リンクは有効期限が切れています。グループのオーナーに再発行を依頼してください'
    default:
      return '招待の確認に失敗しました。時間をおいて再度お試しください'
  }
})

const isFull = computed(
  () =>
    !!preview.value &&
    !preview.value.isMember &&
    preview.value.memberCount >= preview.value.memberLimit,
)

// ログイン・新規登録後にこの画面へ戻すためのクエリ
const redirectQuery = computed(() => ({ redirect: route.fullPath }))

const joining = ref(false)
const joinError = ref('')

async function onJoin() {
  joining.value = true
  joinError.value = ''
  try {
    const group = await joinGroup(inviteCode)
    await navigateTo(`/groups/${group.id}`)
  } catch (e) {
    joinError.value = groupErrorMessage(e)
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-surface px-4">
    <div class="w-full max-w-sm rounded-lg bg-white dark:bg-panel p-6 shadow">
      <NuxtLink to="/" class="mb-4 inline-block text-sm text-gray-500 dark:text-muted"
        >← トップに戻る</NuxtLink
      >

      <p
        v-if="loadErrorCode || !preview"
        class="text-center text-sm text-red-600 dark:text-red-400"
      >
        {{ loadErrorMessage }}
      </p>

      <template v-else>
        <p class="text-center text-sm text-gray-600 dark:text-muted">
          トレ部のグループに招待されています
        </p>
        <h1 class="mt-2 break-all text-center text-xl font-bold text-gray-900 dark:text-ink">
          {{ preview.name }}
        </h1>
        <p class="mt-1 text-center text-xs text-gray-500 dark:text-muted">
          メンバー {{ preview.memberCount }} / {{ preview.memberLimit }}人
        </p>

        <div class="mt-6 flex flex-col gap-3">
          <template v-if="preview.isMember">
            <p class="text-center text-sm text-gray-700 dark:text-ink">
              このグループには参加済みです
            </p>
            <NuxtLink
              :to="`/groups/${preview.groupId}`"
              class="rounded bg-brand-600 py-2 text-center text-sm font-semibold text-white dark:bg-accent dark:text-surface"
            >
              グループを開く
            </NuxtLink>
          </template>

          <p v-else-if="isFull" class="text-center text-sm text-red-600 dark:text-red-400">
            このグループは定員に達しているため参加できません
          </p>

          <template v-else-if="user">
            <button
              type="button"
              :disabled="joining"
              class="rounded bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent dark:text-surface"
              @click="onJoin"
            >
              {{ joining ? '参加中...' : 'このグループに参加する' }}
            </button>
            <p v-if="joinError" class="text-sm text-red-600 dark:text-red-400">{{ joinError }}</p>
          </template>

          <template v-else>
            <p class="text-center text-sm text-gray-700 dark:text-ink">
              参加するには、トレ部のアカウントが必要です
            </p>
            <NuxtLink
              :to="{ path: '/register', query: redirectQuery }"
              class="rounded bg-brand-600 py-2 text-center text-sm font-semibold text-white dark:bg-accent dark:text-surface"
            >
              新規登録して参加
            </NuxtLink>
            <NuxtLink
              :to="{ path: '/login', query: redirectQuery }"
              class="rounded border border-brand-600 dark:border-accent py-2 text-center text-sm font-semibold text-brand-600 dark:text-accent"
            >
              アカウントをお持ちの方はログインして参加
            </NuxtLink>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
