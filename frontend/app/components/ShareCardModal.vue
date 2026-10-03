<!--
  自分の記録の画像カードシェア（Issue #314）。②ホームの「◯◯の記録」から開く全画面モーダル。
  開いた時点でCanvasに画像を描いてプレビューし、ボタンでWeb Share API（画像ファイル＋本文＋URL）に渡す。
  共有シートはボタン押下の直後（ユーザー操作の中）で呼ぶ必要があるため、画像の生成は開いた時点で
  済ませておく。ファイル共有に非対応の環境（PCのブラウザ等）では「画像を保存」だけを出す。
  全画面シート・背景スクロールロックの実装はTermsPrivacyModal.vueに倣った
-->
<script setup lang="ts">
import type { ShareCardData } from '~/utils/shareCard'

const props = defineProps<{
  date: string
  data: ShareCardData
}>()

const emit = defineEmits<{ close: [] }>()

let previousHtmlOverflow = ''
let previousBodyOverflow = ''

const requestUrl = useRequestURL()
// 画像の配色はアプリのテーマ（ライト／ダーク）に合わせる
const { theme } = useTheme()
const previewUrl = ref<string | null>(null)
const imageFile = ref<File | null>(null)
const canShareFile = ref(false)
const generateError = ref(false)
const fileName = `torebu-${props.date.replaceAll('-', '')}.png`

async function generate() {
  try {
    await loadShareCardFonts()
    const canvas = document.createElement('canvas')
    drawShareCard(canvas, props.data, theme.value)
    const blob = await canvasToPngBlob(canvas)
    if (!blob) throw new Error('toBlob failed')
    imageFile.value = new File([blob], fileName, { type: 'image/png' })
    previewUrl.value = URL.createObjectURL(blob)
    canShareFile.value =
      typeof navigator.canShare === 'function' && navigator.canShare({ files: [imageFile.value] })
  } catch {
    generateError.value = true
  }
}

onMounted(() => {
  previousHtmlOverflow = document.documentElement.style.overflow
  previousBodyOverflow = document.body.style.overflow
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  generate()
})
onUnmounted(() => {
  document.documentElement.style.overflow = previousHtmlOverflow
  document.body.style.overflow = previousBodyOverflow
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

const text = shareText(props.data)
const landingUrl = shareLandingUrl(requestUrl.origin)

async function onShare() {
  if (!imageFile.value) return
  try {
    // URLはurl項目に分けず本文の末尾に含める。分けて渡すと、X（旧Twitter）が本文を捨ててURLと画像だけを
    // 投稿画面に入れることがスマホの実機確認で分かったため（2026-10-03。LINEは分けても両方届いていた）
    await navigator.share({ files: [imageFile.value], text: `${text}\n${landingUrl}` })
  } catch {
    // 共有シートを閉じた(AbortError)場合なども含め、何もしない
  }
}

// 「共有する」が使えない環境（PC等）は「画像を保存」での投稿になり、画像だけでは
// トップへのURL（?ref=share）が付かない。投稿時に貼り付けてもらえるよう本文とURLをコピーできるようにする
const copied = ref(false)

async function onCopyText() {
  try {
    await navigator.clipboard.writeText(`${text}\n${landingUrl}`)
    copied.value = true
  } catch {
    // クリップボードAPIが使えない環境もあるため、失敗時は何もしない
    // （本文とURLは画面に表示済みなので、手動選択でコピーできる。グループ詳細の招待リンクと同じ方針）
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-white dark:bg-panel">
    <div class="flex items-center gap-3 border-b border-gray-200 dark:border-border-dark px-4 py-3">
      <button
        type="button"
        class="-m-2.5 flex h-11 w-11 items-center justify-center text-lg text-gray-500 dark:text-muted"
        aria-label="閉じる"
        @click="emit('close')"
      >
        ✕
      </button>
      <h2 class="truncate text-sm font-semibold text-gray-900 dark:text-ink">記録をシェア</h2>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-6">
      <div class="mx-auto flex max-w-sm flex-col gap-3">
        <p v-if="generateError" class="text-center text-sm text-red-600 dark:text-red-400">
          画像の作成に失敗しました。時間をおいて再度お試しください
        </p>
        <img
          v-else-if="previewUrl"
          :src="previewUrl"
          alt="シェアする記録の画像"
          class="w-full rounded-lg border border-gray-200 dark:border-border-dark"
        />
        <LoadingText v-else center>画像を作成中...</LoadingText>
        <p class="text-xs text-gray-500 dark:text-muted">
          画像に載るのはあなたの記録の数字だけです（表示名・メモ・グループの情報は載りません）。
        </p>
        <!-- 「共有する」が使える環境（ほぼスマホ）では共有シートに本文・URLも渡るため出さない
             （2026-10-03ユーザー判断。インスタ等の本文を受け取らないアプリ向けの案内も置かない）。
             判定は画像の作成と同時に決まるため、作成前に一瞬表示されないようpreviewUrlも条件にする -->
        <div
          v-if="previewUrl && !canShareFile"
          class="rounded-lg border border-gray-200 dark:border-border-dark p-3"
        >
          <p class="mb-1 text-xs font-semibold text-gray-500 dark:text-muted">
            画像を保存して投稿するときは、この本文も貼り付けてください
          </p>
          <p class="break-all text-sm text-gray-900 dark:text-ink">
            {{ text }}<br />{{ landingUrl }}
          </p>
          <button
            type="button"
            class="mt-2 w-full rounded border border-gray-300 dark:border-border-dark py-1.5 text-sm font-semibold text-gray-700 dark:text-ink"
            @click="onCopyText"
          >
            {{ copied ? 'コピーしました' : '本文とURLをコピー' }}
          </button>
        </div>
      </div>
    </div>

    <div class="flex gap-2 border-t border-gray-200 dark:border-border-dark px-4 py-3">
      <a
        v-if="previewUrl"
        :href="previewUrl"
        :download="fileName"
        class="flex-1 rounded border border-brand-600 dark:border-accent py-2 text-center text-sm font-semibold text-brand-600 dark:text-accent"
      >
        画像を保存
      </a>
      <button
        v-if="canShareFile"
        type="button"
        class="flex-1 rounded bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 dark:bg-accent dark:text-surface dark:hover:bg-accent/90"
        @click="onShare"
      >
        共有する
      </button>
    </div>
  </div>
</template>
