<script setup lang="ts">
// Phase4: グループ詳細。メンバー一覧・招待コード表示/再発行(オーナー限定)・退会・削除(オーナー限定)
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const groupId = route.params.id as string

const { fetchGroupDetail, reissueInvite, leaveGroup, deleteGroup } = useGroups()

const group = ref<Awaited<ReturnType<typeof fetchGroupDetail>> | null>(null)
const pending = ref(true)
const loadError = ref(false)

async function load() {
  pending.value = true
  loadError.value = false
  try {
    group.value = await fetchGroupDetail(groupId)
  } catch {
    loadError.value = true
  } finally {
    pending.value = false
  }
}
await load()

const isOwner = computed(() => group.value?.role === 'owner')

const reissuing = ref(false)
const reissueError = ref('')
const copied = ref(false)

async function onReissueInvite() {
  reissuing.value = true
  reissueError.value = ''
  copied.value = false
  try {
    const updated = await reissueInvite(groupId)
    if (group.value) {
      group.value.inviteCode = updated.inviteCode
      group.value.inviteExpiresAt = updated.inviteExpiresAt
    }
  } catch (e) {
    reissueError.value = groupErrorMessage(e)
  } finally {
    reissuing.value = false
  }
}

async function onCopyInviteCode() {
  if (!group.value) return
  try {
    await navigator.clipboard.writeText(group.value.inviteCode)
    copied.value = true
  } catch {
    // クリップボードAPIが使えない環境（権限拒否等）もあるため、失敗時は何もしない
    // （招待コードはこの画面に表示済みなので、手動選択でコピーできる）
  }
}

const leaving = ref(false)
const leaveError = ref('')
const confirmingLeave = ref(false)

async function onLeave() {
  leaving.value = true
  leaveError.value = ''
  try {
    await leaveGroup(groupId)
    await navigateTo('/groups')
  } catch (e) {
    leaveError.value = groupErrorMessage(e)
    leaving.value = false
  }
}

const deleting = ref(false)
const deleteError = ref('')
const confirmingDelete = ref(false)

async function onDelete() {
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteGroup(groupId)
    await navigateTo('/groups')
  } catch (e) {
    deleteError.value = groupErrorMessage(e)
    deleting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto flex max-w-sm flex-col gap-4">
      <div class="flex items-center justify-between">
        <NuxtLink to="/groups" class="text-sm text-gray-500">← グループに戻る</NuxtLink>
        <h1 class="text-base font-semibold text-gray-900">グループ詳細</h1>
      </div>

      <p v-if="pending" class="text-center text-sm text-gray-500">読み込み中...</p>
      <p v-else-if="loadError || !group" class="text-center text-sm text-red-600">
        グループの取得に失敗しました。時間をおいて再度お試しください
      </p>

      <template v-else>
        <div class="rounded-lg bg-white p-4 shadow">
          <div class="flex items-center gap-2">
            <h2 class="flex-1 text-base font-bold text-gray-900">{{ group.name }}</h2>
            <span
              v-if="isOwner"
              class="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700"
            >
              オーナー
            </span>
          </div>
          <p class="mt-1 text-xs text-gray-500">
            メンバー {{ group.members.length }} / {{ group.memberLimit }}人
          </p>
          <NuxtLink
            :to="`/groups/${groupId}/workouts`"
            class="mt-3 block rounded border border-brand-600 py-1.5 text-center text-sm font-semibold text-brand-600"
          >
            みんなの記録を見る
          </NuxtLink>
          <NuxtLink
            :to="`/groups/${groupId}/ranking`"
            class="mt-2 block rounded border border-brand-600 py-1.5 text-center text-sm font-semibold text-brand-600"
          >
            ランキングを見る
          </NuxtLink>
        </div>

        <div class="rounded-lg bg-white p-4 shadow">
          <h3 class="text-sm font-semibold text-gray-900">招待コード</h3>
          <p class="mt-2 break-all rounded border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm">
            {{ group.inviteCode }}
          </p>
          <div class="mt-2 flex gap-2">
            <button
              type="button"
              class="flex-1 rounded border border-brand-600 py-1.5 text-sm font-semibold text-brand-600"
              @click="onCopyInviteCode"
            >
              {{ copied ? 'コピーしました' : 'コピー' }}
            </button>
            <button
              v-if="isOwner"
              type="button"
              :disabled="reissuing"
              class="flex-1 rounded border border-gray-300 py-1.5 text-sm text-gray-700 disabled:opacity-50"
              @click="onReissueInvite"
            >
              {{ reissuing ? '再発行中...' : '再発行' }}
            </button>
          </div>
          <p v-if="reissueError" class="mt-2 text-sm text-red-600">{{ reissueError }}</p>
        </div>

        <div class="rounded-lg bg-white p-4 shadow">
          <h3 class="text-sm font-semibold text-gray-900">メンバー</h3>
          <ul class="mt-2 flex flex-col gap-2">
            <li
              v-for="member in group.members"
              :key="member.userId"
              class="flex items-center gap-2 text-sm text-gray-800"
            >
              <span class="flex-1">{{ member.displayName }}</span>
              <span v-if="member.role === 'owner'" class="text-xs font-semibold text-brand-700">
                オーナー
              </span>
            </li>
          </ul>
        </div>

        <div class="flex flex-col gap-2">
          <template v-if="confirmingLeave">
            <p class="text-sm text-gray-700">このグループを退会しますか？</p>
            <div class="flex gap-2">
              <button
                type="button"
                :disabled="leaving"
                class="flex-1 rounded border border-gray-300 py-1.5 text-sm text-gray-700 disabled:opacity-50"
                @click="confirmingLeave = false"
              >
                キャンセル
              </button>
              <button
                type="button"
                :disabled="leaving"
                class="flex-1 rounded bg-red-600 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                @click="onLeave"
              >
                {{ leaving ? '退会中...' : '退会する' }}
              </button>
            </div>
          </template>
          <button
            v-else
            type="button"
            class="rounded border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-600"
            @click="confirmingLeave = true"
          >
            このグループを退会する
          </button>
          <p v-if="leaveError" class="text-sm text-red-600">{{ leaveError }}</p>

          <template v-if="isOwner">
            <template v-if="confirmingDelete">
              <p class="text-sm text-gray-700">
                「{{ group.name }}」を削除しますか？（元に戻せません。メンバー全員が参加できなくなります）
              </p>
              <div class="flex gap-2">
                <button
                  type="button"
                  :disabled="deleting"
                  class="flex-1 rounded border border-gray-300 py-1.5 text-sm text-gray-700 disabled:opacity-50"
                  @click="confirmingDelete = false"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  :disabled="deleting"
                  class="flex-1 rounded bg-red-600 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  @click="onDelete"
                >
                  {{ deleting ? '削除中...' : '削除する' }}
                </button>
              </div>
            </template>
            <button
              v-else
              type="button"
              class="rounded border border-red-600 py-2 text-sm font-semibold text-red-600"
              @click="confirmingDelete = true"
            >
              このグループを削除する
            </button>
            <p v-if="deleteError" class="text-sm text-red-600">{{ deleteError }}</p>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
