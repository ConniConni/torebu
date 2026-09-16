<!--
  未ログイン時のトップ画面（WelcomeScreen）から開く、サービス説明用の全画面オンボーディングモーダル
  （Issue #200）。実際のアプリ画面のスクリーンショット4枚（ダミーデータで撮影、
  frontend/app/assets/images/onboarding_*.png）を使い、「記録する」「部位ハイライトを確認する」
  「仲間とリアクション・コメントし合う」「ランキングで競う」の4つのコア体験を伝える。
  全画面シート・背景スクロールロックの実装はTermsPrivacyModal.vueに倣った。
  スライドの切り替えはJSのスワイプライブラリを使わず、横並び要素+scroll-snapのCSSのみで実装している
-->
<script setup lang="ts">
import recordImage from '~/assets/images/onboarding_record.png'
import muscleImage from '~/assets/images/onboarding_muscle.png'
import feedImage from '~/assets/images/onboarding_feed.png'
import rankingImage from '~/assets/images/onboarding_ranking.png'

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

const slides = [
  {
    image: recordImage,
    title: '毎日の記録をサクッと管理',
    description: 'カレンダーと期間別サマリーで、今日やったトレーニングも過去の記録もひと目で振り返れる。',
  },
  {
    image: muscleImage,
    title: '種目がどこに効くか一目で確認',
    description: '種目一覧の「ⓘ」から、その種目が効く部位を体のイラストでハイライト表示。狙った部位を鍛えられているか確認できる。',
  },
  {
    image: feedImage,
    title: '仲間の記録にいいね・コメント',
    description: 'グループのメンバーの記録がフィードに流れてくる。いいねやコメントで応援し合いながら続けられる。',
  },
  {
    image: rankingImage,
    title: 'ランキングで競い合う',
    description: '週間・月間・通算の合計挙上重量でグループ内ランキング。仲間と競い合うから、もうひと踏ん張りできる。',
  },
]

const trackRef = ref<HTMLElement | null>(null)
const activeIndex = ref(0)

function scrollToSlide(index: number) {
  const track = trackRef.value
  if (!track) return
  track.scrollTo({ left: track.clientWidth * index, behavior: 'smooth' })
}

function onTrackScroll() {
  const track = trackRef.value
  if (!track || track.clientWidth === 0) return
  activeIndex.value = Math.round(track.scrollLeft / track.clientWidth)
}

const isLastSlide = computed(() => activeIndex.value === slides.length - 1)
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-white">
    <div class="flex items-center justify-between px-4 py-3">
      <span class="text-sm font-semibold text-gray-900">トレ部でできること</span>
      <button type="button" class="text-lg text-gray-500" aria-label="閉じる" @click="emit('close')">
        ✕
      </button>
    </div>

    <div
      ref="trackRef"
      class="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      style="scrollbar-width: none"
      @scroll="onTrackScroll"
    >
      <div
        v-for="slide in slides"
        :key="slide.title"
        class="flex w-full shrink-0 snap-center flex-col items-center overflow-y-auto px-6 pt-2 pb-6"
      >
        <img
          :src="slide.image"
          alt=""
          class="w-full max-w-[280px] rounded-2xl border border-gray-200 shadow-lg"
        />
        <h3 class="mt-6 text-center text-lg font-bold text-gray-900">{{ slide.title }}</h3>
        <p class="mt-2 max-w-xs text-center text-sm leading-relaxed text-gray-600">
          {{ slide.description }}
        </p>
      </div>
    </div>

    <div class="shrink-0 px-6 pb-6" style="padding-bottom: max(1.5rem, env(safe-area-inset-bottom))">
      <div class="mb-4 flex items-center justify-center gap-2">
        <button
          v-for="(slide, index) in slides"
          :key="slide.title"
          type="button"
          class="h-2 rounded-full transition-all"
          :class="index === activeIndex ? 'w-5 bg-brand-600' : 'w-2 bg-gray-300'"
          :aria-label="`${index + 1}枚目のスライドを表示`"
          :aria-current="index === activeIndex"
          @click="scrollToSlide(index)"
        />
      </div>
      <button
        v-if="!isLastSlide"
        type="button"
        class="w-full rounded-full bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        @click="scrollToSlide(activeIndex + 1)"
      >
        次へ
      </button>
      <button
        v-else
        type="button"
        class="w-full rounded-full bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        @click="emit('close')"
      >
        閉じる
      </button>
    </div>
  </div>
</template>
