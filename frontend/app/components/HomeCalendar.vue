<script setup lang="ts">
const props = defineProps<{
  // セットが1件以上ある日（塗りつぶし丸で表現）とメモのみの日（小さい点で表現）を
  // 区別して受け取る（Issue #99）。「トレーニングした日をパッと見て分かるための印」
  // という意図に合わせ、メモだけの日は記録ありの印から外す
  recordedDates: Set<string>
  memoOnlyDates: Set<string>
  selectedDate: string | null
}>()

const emit = defineEmits<{ select: [date: string] }>()

const today = todayLocalDateString()
const [initialYear, initialMonth] = today.split('-').map(Number) as [number, number]

const viewYear = ref(initialYear)
const viewMonth = ref(initialMonth) // 1〜12

const monthLabel = computed(() => `${viewYear.value}年${viewMonth.value}月`)

const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土']

interface CalendarCell {
  date: string
  day: number
  inCurrentMonth: boolean
  isToday: boolean
  hasSets: boolean
  memoOnly: boolean
}

// 常に6週(42マス)のグリッドで表示する。前後月の日は薄く表示して埋める
const cells = computed<CalendarCell[]>(() => {
  const firstOfMonth = new Date(viewYear.value, viewMonth.value - 1, 1)
  const gridStart = new Date(viewYear.value, viewMonth.value - 1, 1 - firstOfMonth.getDay())

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    const dateStr = toLocalDateString(d)
    return {
      date: dateStr,
      day: d.getDate(),
      inCurrentMonth: d.getMonth() === viewMonth.value - 1,
      isToday: dateStr === today,
      hasSets: props.recordedDates.has(dateStr),
      memoOnly: props.memoOnlyDates.has(dateStr),
    }
  })
})

function prevMonth() {
  if (viewMonth.value === 1) {
    viewYear.value -= 1
    viewMonth.value = 12
  } else {
    viewMonth.value -= 1
  }
}

function nextMonth() {
  if (viewMonth.value === 12) {
    viewYear.value += 1
    viewMonth.value = 1
  } else {
    viewMonth.value += 1
  }
}
</script>

<template>
  <div class="rounded-lg bg-white p-4 shadow">
    <div class="mb-3 flex items-center justify-between">
      <button
        type="button"
        aria-label="前の月"
        class="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
        @click="prevMonth"
      >
        ＜
      </button>
      <p class="text-sm font-semibold text-gray-900">{{ monthLabel }}</p>
      <button
        type="button"
        aria-label="次の月"
        class="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
        @click="nextMonth"
      >
        ＞
      </button>
    </div>

    <div class="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
      <span v-for="label in weekdayLabels" :key="label">{{ label }}</span>
    </div>

    <div class="mt-1 grid grid-cols-7 gap-1">
      <button
        v-for="cell in cells"
        :key="cell.date"
        type="button"
        class="flex aspect-square flex-col items-center justify-center rounded text-sm"
        :class="[
          cell.inCurrentMonth ? 'text-gray-900' : 'text-gray-300',
          cell.date === selectedDate ? '' : 'hover:bg-gray-100',
        ]"
        @click="emit('select', cell.date)"
      >
        <!-- セットを1件以上記録した日は、下に小さい点を添えるだけの表現だと見づらいという指摘
             （2026-09-04）を受けて、日付そのものを丸背景で塗りつぶす表現にしている。「今日」の印は
             これと区別するため、塗りつぶしではなく輪郭（リング）にしている -->
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full"
          :class="[
            cell.date === selectedDate
              ? 'bg-blue-600 text-white'
              : cell.hasSets
                ? 'bg-blue-100 font-semibold text-blue-700'
                : '',
            cell.isToday && cell.date !== selectedDate ? 'ring-2 ring-blue-600' : '',
          ]"
        >
          {{ cell.day }}
        </span>
        <!-- メモのみでセット0件の日は「トレーニングした日」の印（上の丸塗り）には含めず、
             区別できる程度の小さい点だけを添える（Issue #99）。memoOnlyがfalseのときも
             bg-transparentで高さを確保し、行によって縦位置がずれないようにする -->
        <span
          class="mt-0.5 h-1 w-1 rounded-full"
          :class="cell.memoOnly ? (cell.date === selectedDate ? 'bg-white' : 'bg-blue-600') : 'bg-transparent'"
        />
      </button>
    </div>
  </div>
</template>
