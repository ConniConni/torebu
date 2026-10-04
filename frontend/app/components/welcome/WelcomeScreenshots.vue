<!-- 特設ページ「画面イメージ」（Issue #332）。既存のオンボーディング用スクショ（ダミーデータで撮影）を
     流用する。記録→応援の流れに沿って「記録・フィード」を主役にし、部位ハイライトは補足の位置づけ -->
<script setup lang="ts">
import recordImage from '~/assets/images/onboarding_record.png'
import feedImage from '~/assets/images/onboarding_feed.png'
import muscleImage from '~/assets/images/onboarding_muscle.png'

const shots = [
  { image: recordImage, caption: 'サクッと記録' },
  { image: feedImage, caption: '応援が届く' },
  { image: muscleImage, caption: '効く部位がわかる' },
]
</script>

<template>
  <section class="border-t border-brand-100 px-6 py-10 dark:border-[#2e343b]">
    <p class="text-xs font-semibold text-brand-700 dark:text-[#c8ff4d]">画面イメージ</p>
    <h2 class="mt-1 text-xl leading-snug font-bold text-gray-900 dark:text-[#f6f5f0]">
      こんな画面で使います
    </h2>
    <div class="mt-4 grid grid-cols-3 gap-2">
      <figure v-for="shot in shots" :key="shot.caption">
        <img
          :src="shot.image"
          alt=""
          loading="lazy"
          class="aspect-[9/16] w-full rounded-lg border border-gray-200 object-cover object-top shadow dark:border-border-dark"
        />
        <figcaption class="mt-1.5 text-center text-[11px] text-gray-700 dark:text-[#b7b6ad]">
          {{ shot.caption }}
        </figcaption>
      </figure>
    </div>
  </section>
</template>
