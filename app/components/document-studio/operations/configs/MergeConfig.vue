<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: { outputName?: string }
  defaultFolder?: string
}>(), {
  modelValue: () => ({ outputName: '' }),
  defaultFolder: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: { outputName?: string }]
}>()

const { t } = useI18n()

const outputName = computed({
  get: () => props.modelValue?.outputName ?? '',
  set: (val: string) => emit('update:modelValue', { ...props.modelValue, outputName: val })
})

const placeholderName = computed(() => {
  if (props.defaultFolder) {
    return `${props.defaultFolder}_merged.pdf`
  }
  return 'merged.pdf'
})
</script>

<template>
  <div class="space-y-3">
    <div class="panel-flat flex flex-col gap-2 rounded-lg p-3">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-primary" />
        <label for="merge-output-name" class="text-xs font-semibold uppercase tracking-wide text-muted">
          {{ t('document.merge.outputNameLabel') }}
        </label>
      </div>
      <UInput
        id="merge-output-name"
        v-model="outputName"
        class="w-full"
        size="sm"
        :placeholder="placeholderName"
        :aria-label="t('document.merge.outputNameLabel')"
      />
      <p class="text-[11px] text-muted">
        {{ t('document.merge.outputNameHint') }}
      </p>
    </div>

    <p class="rounded-md bg-muted/20 p-2 text-xs text-muted">
      {{ t('document.merge.configHint') }}
    </p>
  </div>
</template>

