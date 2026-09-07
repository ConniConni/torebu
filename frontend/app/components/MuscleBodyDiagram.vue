<!--
  部位ハイライトの人体図(前面 or 背面、片側)。プロトタイプ(docs/muscle-highlight.md参照)のbuildSvg()を
  そのまま流用し、propsが変わるたびSVGを再構築する。座標データはmuscle-body-svg.json
  (react-native-body-highlighter由来、MIT。assets/data/muscle-body-svg.LICENSE.md参照)。
-->
<script setup lang="ts">
import { buildSvg, type IntensityMap, type LabelMap, type ZoneSpec } from '~/utils/muscleHighlightSvg'

interface SvgPart {
  slug: string
  path: { common?: string[]; left?: string[]; right?: string[] }
}

const props = defineProps<{
  svgId: string
  parts: SvgPart[]
  outlineD: string
  viewBox: string
  intensityMap: IntensityMap
  zoneSpecs: ZoneSpec[]
  labelMap: LabelMap
}>()

const svgEl = ref<SVGSVGElement | null>(null)

function render() {
  if (!svgEl.value) return
  buildSvg(svgEl.value, props.parts, props.outlineD, props.intensityMap, props.zoneSpecs, props.labelMap)
}

onMounted(render)
watch(() => [props.parts, props.outlineD, props.intensityMap, props.zoneSpecs, props.labelMap], render, {
  deep: true,
})
</script>

<template>
  <svg :id="svgId" ref="svgEl" class="muscle-body-svg h-full w-auto" :viewBox="viewBox" />
</template>

<style scoped>
.muscle-body-svg :deep(.body-outline path) {
  fill: none;
  stroke: rgb(100 112 128 / 0.5);
  stroke-width: 2.5;
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.muscle-body-svg :deep(.body-head path) {
  fill: rgb(100 112 128 / 0.06);
  stroke: rgb(100 112 128 / 0.5);
  stroke-width: 2.5;
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.muscle-body-svg :deep(.muscle-label) {
  font-family:
    'Hiragino Sans',
    'Noto Sans JP',
    sans-serif;
  font-size: 26px;
  font-weight: 500;
  fill: rgb(55 65 81 / 0.9);
  paint-order: stroke;
  stroke: rgb(255 255 255 / 0.85);
  stroke-width: 4px;
  stroke-linejoin: round;
}
.muscle-body-svg :deep(.muscle-label-main) {
  font-size: 30px;
  font-weight: 700;
  fill: rgb(199 60 20);
}
</style>
