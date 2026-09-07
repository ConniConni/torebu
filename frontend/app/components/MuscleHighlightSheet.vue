<!--
  ④種目選択画面の「ⓘ」ボタンから開く、部位ハイライトの全画面シート(Issue #106)。
  画面配置・UI仕様はdocs/muscle-highlight.md「画面配置・UI仕様」参照：
  - 全画面シート(ポップオーバーではない)。上部に✕と種目名を固定表示
  - 前面/背面トグルを常設。光る部位が無い面を選んでも図と注記を出す(選択肢を隠さない)
  - 「関連筋も見る」トグル(プロトタイプ由来)：初期状態は主働筋のみ表示で、関連筋がある種目だけ
    ボタンを出す
-->
<script setup lang="ts">
import { BODY_SVG_DATA, ZONE_LABEL } from '~/utils/muscleHighlightSvg'
import type { MuscleZone } from '~/utils/muscleSlugs'

const props = defineProps<{
  exerciseName: string
  mainMuscle: string | null
  relatedMuscles: string[]
  mainZone: string | null
}>()

const emit = defineEmits<{ close: [] }>()

// 主働筋のみ表示がデフォルト(プロトタイプと同じ初期状態)。ボタンで関連筋の表示をon/offする
const showRelated = ref(false)

const highlight = computed(() =>
  useMuscleHighlight(
    {
      mainMuscle: props.mainMuscle,
      relatedMuscles: props.relatedMuscles,
      mainZone: props.mainZone,
    },
    showRelated.value,
  ),
)

type Side = 'front' | 'back'
// 発光がある面を初期表示にする(両方無ければfront)。以後は手動トグルに従う
const side = ref<Side>(highlight.value.back.active && !highlight.value.front.active ? 'back' : 'front')

const currentSide = computed(() => highlight.value[side.value])

const mainZoneLabel = computed(() => {
  const zone = props.mainZone as MuscleZone | null
  return zone ? ZONE_LABEL[zone] : undefined
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-white">
    <div class="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
      <button type="button" class="text-lg text-gray-500" aria-label="閉じる" @click="emit('close')">✕</button>
      <h2 class="truncate text-sm font-semibold text-gray-900">{{ exerciseName }}</h2>
    </div>

    <div v-if="!highlight.hasHighlightData" class="flex flex-1 items-center justify-center px-6">
      <p class="text-center text-sm text-gray-500">部位ハイライトのデータがありません</p>
    </div>

    <template v-else>
      <div class="flex justify-center gap-1 border-b border-gray-200 bg-gray-50 p-2">
        <button
          type="button"
          class="rounded-full px-4 py-1 text-xs font-medium"
          :class="side === 'front' ? 'bg-blue-600 text-white' : 'text-gray-600'"
          @click="side = 'front'"
        >
          前面
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-1 text-xs font-medium"
          :class="side === 'back' ? 'bg-blue-600 text-white' : 'text-gray-600'"
          @click="side = 'back'"
        >
          背面
        </button>
        <button
          v-if="relatedMuscles.length"
          type="button"
          class="ml-2 rounded-full border border-gray-300 px-4 py-1 text-xs font-medium text-gray-600"
          @click="showRelated = !showRelated"
        >
          {{ showRelated ? '主働筋のみ表示' : '関連筋も見る' }}
        </button>
      </div>

      <div class="flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-2">
        <MuscleBodyDiagram
          :svg-id="`muscle-highlight-${side}`"
          :parts="side === 'front' ? BODY_SVG_DATA.front : BODY_SVG_DATA.back"
          :outline-d="side === 'front' ? BODY_SVG_DATA.outlineFront : BODY_SVG_DATA.outlineBack"
          :view-box="side === 'front' ? BODY_SVG_DATA.viewBox.front : BODY_SVG_DATA.viewBox.back"
          :intensity-map="currentSide.intensityMap"
          :zone-specs="currentSide.zoneSpecs"
          :label-map="currentSide.labelMap"
          class="max-h-full"
        />
        <p v-if="!currentSide.active" class="mt-2 text-xs text-gray-400">この面に光る部位はありません</p>
      </div>

      <div class="border-t border-gray-200 px-4 py-3 text-sm text-gray-700">
        <p>
          <span class="font-semibold text-blue-700">主働筋</span>：{{ mainMuscle
          }}<template v-if="mainZoneLabel">（{{ mainZoneLabel }}に効きやすい）</template>
        </p>
        <p v-if="showRelated && relatedMuscles.length" class="mt-1">
          <span class="font-semibold text-blue-400">関連筋</span>：{{ relatedMuscles.join('、') }}
        </p>
      </div>
    </template>
  </div>
</template>
