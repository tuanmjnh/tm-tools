<script setup lang="ts">
const props = withDefaults(defineProps<{
  label: string
  modelValue: string
  placeholder?: string
  rows?: number
  readonly?: boolean
  allowDownload?: boolean
  allowCopy?: boolean
  allowPaste?: boolean
  allowClear?: boolean
  showBadge?: boolean
  showStats?: boolean
}>(), {
  rows: 8,
  readonly: false,
  placeholder: '',
  allowDownload: false,
  allowCopy: true,
  allowPaste: true,
  allowClear: true,
  showBadge: true,
  showStats: false
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n()
const toast = useToast()
const transform = useTextTransform()

const stats = computed(() => transform.countStats(props.modelValue || ''))

async function copy() {
  try {
    await navigator.clipboard.writeText(props.modelValue)
    toast.add({ title: t('utilities.text.copied'), color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: t('common.error'), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

async function paste() {
  try {
    const text = await navigator.clipboard.readText()
    emit('update:modelValue', text)
  } catch {
    toast.add({ title: t('common.error'), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

function download() {
  const blob = new Blob([props.modelValue], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `text-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div
    class="flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between px-4 py-2.5 bg-gray-50/70 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-800 shrink-0 gap-2"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider truncate">
          {{ label }}
        </span>
        <UBadge
          v-if="showBadge"
          :color="readonly ? 'primary' : 'neutral'"
          variant="subtle"
          size="xs"
          class="shrink-0"
        >
          {{ stats.chars }} {{ t('utilities.text.stats.chars') }}
        </UBadge>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <slot name="header-extra" />
        <UButton
          v-if="!readonly && allowPaste"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-clipboard-paste"
          :title="t('utilities.text.paste')"
          @click="paste"
        />
        <UButton
          v-if="modelValue && allowCopy"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-copy"
          :title="t('utilities.text.copy')"
          @click="copy"
        />
        <UButton
          v-if="!readonly && modelValue && allowClear"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          :title="t('utilities.text.clear')"
          @click="emit('update:modelValue', '')"
        />
        <UButton
          v-if="modelValue && allowDownload"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-download"
          :title="t('utilities.text.download')"
          @click="download"
        />
        <slot name="header-actions" />
      </div>
    </div>

    <!-- Textarea Body -->
    <div class="flex-1 p-3 flex flex-col min-h-0" :class="readonly ? 'bg-gray-50/20 dark:bg-gray-950/20' : ''">
      <textarea
        :value="modelValue"
        :placeholder="placeholder"
        :readonly="readonly"
        :rows="rows"
        class="w-full flex-1 min-h-50 resize-none font-mono text-sm bg-transparent border-0 focus:ring-0 focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 leading-relaxed overflow-y-auto"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      />
    </div>

    <!-- Footer -->
    <div
      v-if="$slots.footer || showStats"
      class="px-4 py-2 bg-gray-50/50 dark:bg-gray-950/40 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[11px] text-gray-500 font-mono shrink-0"
    >
      <slot name="footer">
        <div class="flex items-center gap-3">
          <span>{{ stats.words }} {{ t('utilities.text.stats.words') }}</span>
          <span>{{ stats.lines }} {{ t('utilities.text.stats.lines') }}</span>
          <span>{{ stats.paragraphs }} {{ t('utilities.text.stats.paragraphs') }}</span>
        </div>
        <span>~{{ stats.readingTimeMinutes }}m {{ t('utilities.text.stats.readingTime') }}</span>
      </slot>
    </div>
  </div>
</template>
