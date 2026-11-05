<script setup lang="ts">
/** Read-only text surface for xml/csv/json sources that are not tabular. */
const props = withDefaults(defineProps<{
  text: string
  language?: string
}>(), { language: 'text' })

const { t } = useI18n()
const toast = useToast()
const wrap = ref(true)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text)
    toast.add({ title: t('pdf.actions.copy'), color: 'success' })
  } catch {
    toast.add({ title: t('pdf.actions.copy'), description: t('pdf.errors.generic'), color: 'error' })
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="flex items-center justify-between gap-2 border-b border-default px-3 py-2">
      <span class="mono text-[11px] uppercase text-dimmed">{{ language }}</span>
      <div class="flex items-center gap-1.5">
        <UButton
          :icon="wrap ? 'i-lucide-wrap-text' : 'i-lucide-scroll-text'"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :aria-label="t('pdf.preview.wrap')"
          :title="t('pdf.preview.wrap')"
          @click="wrap = !wrap"
        />
        <UButton
          icon="i-lucide-copy"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :aria-label="t('pdf.actions.copy')"
          :title="t('pdf.actions.copy')"
          @click="copy"
        />
      </div>
    </div>

    <pre
      class="min-h-0 flex-1 overflow-auto p-3 text-xs leading-relaxed mono"
      :class="wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'"
    >{{ text }}</pre>
  </div>
</template>
