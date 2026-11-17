<script setup lang="ts">
import type { ImageConvertConfigModel } from '~/utils/documentStudio'

const props = withDefaults(defineProps<{
  modelValue?: ImageConvertConfigModel
}>(), {
  modelValue: () => ({ target: 'png', sizes: [16, 32, 48, 256] })
})

const emit = defineEmits<{
  'update:modelValue': [value: ImageConvertConfigModel]
}>()

const { t } = useI18n()

const targets = computed(() => [
  { value: 'png' as const, label: 'PNG', hint: t('document.imageConvert.targetPngHint') },
  { value: 'jpg' as const, label: 'JPG', hint: t('document.imageConvert.targetJpgHint') },
  { value: 'webp' as const, label: 'WEBP', hint: t('document.imageConvert.targetWebpHint') },
  { value: 'ico' as const, label: '.ICO', hint: t('document.imageConvert.targetIcoHint') }
])

/** The ICO size ladder. 512 is a PNG export that rides alongside the .ico. */
const sizes = [16, 32, 48, 64, 128, 256, 512] as const

const target = computed(() => props.modelValue?.target ?? 'png')
const selectedSizes = computed(() => new Set(props.modelValue?.sizes ?? []))

function selectTarget(value: 'png' | 'jpg' | 'webp' | 'ico') {
  emit('update:modelValue', { ...props.modelValue, target: value })
}

function toggleSize(size: number) {
  const next = new Set(selectedSizes.value)
  if (next.has(size)) next.delete(size)
  else next.add(size)
  emit('update:modelValue', { ...props.modelValue, sizes: [...next].sort((a, b) => a - b) })
}

const quality = computed({
  get: () => props.modelValue?.quality ?? 90,
  set: (value: number) => emit('update:modelValue', { ...props.modelValue, quality: value })
})

const showQuality = computed(() => target.value === 'jpg' || target.value === 'webp')
</script>

<template>
  <div class="space-y-3">
    <UFormField :label="t('document.imageConvert.target')">
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="entry in targets"
          :key="entry.value"
          type="button"
          class="panel-flat flex flex-col items-center gap-1 rounded-md py-2 text-xs font-semibold transition-all cursor-pointer"
          :class="target === entry.value
            ? 'border-primary ring-1 ring-primary/30 bg-primary/5 text-primary'
            : 'text-muted hover:border-primary/50 hover:bg-muted/10'"
          :aria-pressed="target === entry.value"
          :title="entry.hint"
          @click="selectTarget(entry.value)"
        >
          {{ entry.label }}
        </button>
      </div>
    </UFormField>

    <UFormField
      v-if="target === 'ico'"
      :label="t('document.imageConvert.sizes')"
      :description="t('document.imageConvert.sizesHint')"
    >
      <div class="flex flex-wrap gap-2">
        <button
          v-for="size in sizes"
          :key="size"
          type="button"
          class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer"
          :class="selectedSizes.has(size)
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-default/70 text-muted hover:border-primary/50'"
          :aria-pressed="selectedSizes.has(size)"
          @click="toggleSize(size)"
        >
          {{ size }}
        </button>
      </div>
    </UFormField>

    <UFormField v-if="showQuality" :label="t('document.imageConvert.quality')">
      <div class="flex items-center gap-2">
        <input
          v-model.number="quality"
          type="range"
          min="1"
          max="100"
          class="w-full accent-primary"
        >
        <span class="w-10 text-end text-xs text-muted">{{ quality }}</span>
      </div>
    </UFormField>
  </div>
</template>
