<script setup lang="ts">
/** Renders a header row + records for csv/xlsx files, with a quick filter and horizontal scroll support. */
const props = withDefaults(defineProps<{
  rows: string[][]
  name?: string
  maxRows?: number
}>(), { maxRows: 500 })

const { t } = useI18n()
const notify = useNotify()
const query = ref('')
const wrapText = ref(false)

const header = computed(() => (props.rows.length > 1 ? props.rows[0] ?? [] : []))
const body = computed(() => (props.rows.length > 1 ? props.rows.slice(1) : props.rows))

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  const rows = needle
    ? body.value.filter(row => row.some(cell => String(cell).toLowerCase().includes(needle)))
    : body.value
  return rows.slice(0, props.maxRows)
})

const truncated = computed(() => filtered.value.length < body.value.length && body.value.length > props.maxRows)

async function copyCell(text: string) {
  if (!import.meta.client || !text) return
  try {
    await navigator.clipboard.writeText(text)
    notify.success(t('pdf.actions.copied'), text)
  } catch {
    // clipboard might fail without focus
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col w-full min-w-0 overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-3 py-2 bg-elevated/30 shrink-0">
      <div class="flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-table-2" class="size-3.5 text-primary" />
        <span class="mono font-medium text-highlighted">{{ body.length }} {{ t('pdf.preview.rows') }}</span>
        <span v-if="header.length" class="mono text-muted">· {{ header.length }} {{ t('pdf.preview.columns') }}</span>
        <UBadge
          v-if="header.length > 6"
          color="neutral"
          variant="subtle"
          size="sm"
          class="hidden sm:inline-flex gap-1 text-[11px]"
        >
          <UIcon name="i-lucide-move-horizontal" class="size-3" />
          {{ t('pdf.preview.horizontalScrollHint') }}
        </UBadge>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          :icon="wrapText ? 'i-lucide-wrap-text' : 'i-lucide-align-left'"
          :label="t('pdf.preview.wrap')"
          color="neutral"
          :variant="wrapText ? 'soft' : 'ghost'"
          size="xs"
          @click="wrapText = !wrapText"
        />

        <UInput
          v-model="query"
          icon="i-lucide-search"
          size="xs"
          :placeholder="t('pdf.preview.filter')"
          class="w-44 sm:w-56"
        />
      </div>
    </div>

    <div class="min-h-0 flex-1 w-full max-w-full overflow-x-auto overflow-y-auto overscroll-contain bg-default">
      <table class="border-collapse text-xs w-full min-w-max">
        <thead class="sticky top-0 z-20 bg-elevated border-b border-default shadow-xs">
          <tr>
            <th class="sticky left-0 z-30 bg-elevated border-b border-r border-default px-2.5 py-2 text-end font-mono text-[11px] font-semibold text-dimmed w-12 shrink-0 select-none">
              #
            </th>
            <th
              v-for="(cell, index) in header"
              :key="index"
              class="border-b border-r border-default/70 px-3 py-2 text-start font-semibold text-highlighted select-none"
              :class="wrapText ? 'min-w-40 max-w-xs whitespace-normal' : 'whitespace-nowrap min-w-32'"
              :title="cell"
            >
              <div class="flex items-center justify-between gap-2">
                <span>{{ cell || '—' }}</span>
                <button
                  type="button"
                  class="opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity"
                  :title="t('pdf.actions.copyName')"
                  @click.stop="copyCell(cell)"
                >
                  <UIcon name="i-lucide-copy" class="size-3" />
                </button>
              </div>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default/60">
          <tr
            v-for="(row, rowIndex) in filtered"
            :key="rowIndex"
            class="group transition-colors hover:bg-elevated/60 odd:bg-elevated/20"
          >
            <td class="sticky left-0 z-10 bg-elevated/90 backdrop-blur-xs border-r border-default px-2.5 py-2 text-end text-dimmed font-mono text-[11px] tabular-nums select-none">
              {{ rowIndex + 1 }}
            </td>
            <td
              v-for="(cell, cellIndex) in row"
              :key="cellIndex"
              class="border-r border-default/50 px-3 py-2 text-default transition-colors hover:bg-primary/5 cursor-pointer"
              :class="wrapText ? 'min-w-40 max-w-md break-words whitespace-normal' : 'whitespace-nowrap min-w-32'"
              :title="`${cell} (Click để copy)`"
              @click="copyCell(cell)"
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="!filtered.length" class="flex flex-col items-center justify-center p-12 text-center text-xs text-muted">
        <UIcon name="i-lucide-table-properties" class="size-6 text-dimmed mb-1" />
        <p>{{ t('pdf.preview.empty') }}</p>
      </div>

      <div v-else-if="truncated" class="sticky bottom-0 left-0 bg-elevated/90 backdrop-blur-xs border-t border-default px-3 py-2 text-[11px] text-muted flex items-center justify-between">
        <span>{{ t('pdf.preview.truncated', { shown: filtered.length, total: body.length }) }}</span>
      </div>
    </div>
  </div>
</template>
