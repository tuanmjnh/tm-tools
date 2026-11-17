<script setup lang="ts">
import type { BackgroundConfigModel } from '~/utils/documentStudio'

const props = withDefaults(defineProps<{
  modelValue?: BackgroundConfigModel
}>(), {
  modelValue: () => ({ mode: 'chroma' })
})

const emit = defineEmits<{
  'update:modelValue': [value: BackgroundConfigModel]
}>()

const { t } = useI18n()

const mode = computed(() => props.modelValue?.mode ?? 'chroma')

const modes = computed(() => [
  { value: 'chroma' as const, label: t('document.removeBackground.modeChroma'), hint: t('document.removeBackground.modeChromaHint') },
  { value: 'ai' as const, label: t('document.removeBackground.modeAi'), hint: t('document.removeBackground.modeAiHint') }
])

function selectMode(value: 'chroma' | 'ai') {
  emit('update:modelValue', { ...props.modelValue, mode: value })
}

const tolerance = computed({
  get: () => props.modelValue?.tolerance ?? 30,
  set: (value: number) => emit('update:modelValue', { ...props.modelValue, tolerance: value })
})

const backdropHex = computed({
  get: () => {
    const [r, g, b] = props.modelValue?.backdrop ?? [255, 255, 255]
    return '#' + [r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('')
  },
  set: (value: string) => {
    const hex = value.replace('#', '')
    if (hex.length !== 6) return
    emit('update:modelValue', {
      ...props.modelValue,
      backdrop: [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ]
    })
  }
})
</script>

<template>
  <div class="space-y-3">
    <UFormField :label="t('document.removeBackground.mode')">
      <div class="grid gap-2">
        <button
          v-for="entry in modes"
          :key="entry.value"
          type="button"
          class="panel-flat flex w-full items-start gap-3 rounded-md p-3 text-start transition-all cursor-pointer"
          :class="[
            mode === entry.value
              ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
              : 'border-default hover:border-default/80 hover:bg-muted/10'
          ]"
          :aria-pressed="mode === entry.value"
          @click="selectMode(entry.value)"
        >
          <div
            class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
            :class="mode === entry.value ? 'border-primary bg-primary text-primary-foreground' : 'border-gray-500 bg-transparent'"
          >
            <UIcon v-if="mode === entry.value" name="i-lucide-check" class="size-3" />
          </div>
          <span class="min-w-0">
            <span class="block text-sm font-medium">{{ entry.label }}</span>
            <span class="block text-xs text-muted">{{ entry.hint }}</span>
          </span>
        </button>
      </div>
    </UFormField>

    <template v-if="mode === 'chroma'">
      <UFormField :label="t('document.removeBackground.backdrop')">
        <UInput v-model="backdropHex" type="color" class="w-full" />
      </UFormField>
      <UFormField :label="t('document.removeBackground.tolerance')">
        <div class="flex items-center gap-3">
          <input
            v-model.number="tolerance"
            type="range"
            min="0"
            max="120"
            class="flex-1 accent-primary"
          >
          <span class="w-10 text-right text-xs font-mono">{{ tolerance }}</span>
        </div>
      </UFormField>
    </template>

    <p v-else class="rounded-md bg-warning/10 p-2 text-xs text-warning">
      {{ t('document.removeBackground.aiPending') }}
    </p>
  </div>
</template>
