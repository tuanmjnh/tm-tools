<script setup lang="ts">
/**
 * "Input → operation → output" strip. Presentation only: the page resolves the
 * input, the operation name and the output area, this component just shows them.
 */
const props = withDefaults(defineProps<{
  operation: string
  input: {
    label: string
    detail?: string
  }
  output: {
    areaLabel: string
    /** Folder or file inside the area, when the name is already known. */
    relativePath?: string
    /** Extra destinations an operation writes to besides `areaLabel`. */
    alternates?: string[]
    openable?: boolean
  }
  state?: 'empty' | 'partial' | 'ready'
}>(), {
  state: 'empty'
})

const emit = defineEmits<{ openOutput: [] }>()

const { t } = useI18n()

const stateIcon = computed(() => {
  switch (props.state) {
    case 'ready': return 'i-lucide-circle-check'
    case 'partial': return 'i-lucide-circle-dashed'
    default: return 'i-lucide-circle-dashed'
  }
})

const stateTone = computed(() => {
  switch (props.state) {
    case 'ready': return 'text-(--ui-success)'
    case 'partial': return 'text-(--ui-warning)'
    default: return 'text-dimmed'
  }
})
</script>

<template>
  <div class="panel-flat flex flex-col gap-2 px-3 py-2 text-xs md:flex-row md:items-center md:gap-3">
    <div class="flex min-w-0 items-start gap-2 md:flex-1">
      <span class="w-16 shrink-0 pt-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
        {{ t('pdf.flow.input') }}
      </span>
      <span class="min-w-0 space-y-0.5">
        <span class="block truncate font-medium" :title="input.label">{{ input.label }}</span>
        <span v-if="input.detail" class="mono block truncate text-[11px] text-muted">{{ input.detail }}</span>
      </span>
    </div>

    <UIcon name="i-lucide-arrow-right" class="hidden size-4 shrink-0 text-dimmed md:block" />

    <div class="flex min-w-0 items-center gap-2">
      <span class="w-16 shrink-0 text-[10px] font-semibold tracking-wide text-muted uppercase md:hidden">
        {{ t('pdf.flow.process') }}
      </span>
      <UIcon :name="stateIcon" class="size-4 shrink-0" :class="stateTone" />
      <span class="truncate font-medium">{{ operation }}</span>
    </div>

    <UIcon name="i-lucide-arrow-right" class="hidden size-4 shrink-0 text-dimmed md:block" />

    <div class="flex min-w-0 items-start gap-2 md:flex-1">
      <span class="w-16 shrink-0 pt-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
        {{ t('pdf.flow.output') }}
      </span>
      <span class="min-w-0 space-y-0.5">
        <span class="block truncate font-medium" :title="output.areaLabel">{{ output.areaLabel }}</span>
        <span v-if="output.relativePath" class="mono block truncate text-[11px] text-muted">
          {{ output.relativePath }}
        </span>
        <span v-if="output.alternates?.length" class="block text-[11px] leading-snug text-muted">
          {{ t('pdf.flow.alongside', { areas: output.alternates.join(', ') }) }}
        </span>
      </span>
    </div>

    <UButton
      v-if="output.openable"
      icon="i-lucide-folder-open"
      :label="t('pdf.actions.openOutputFolder')"
      color="neutral"
      variant="ghost"
      size="xs"
      class="shrink-0 self-start md:self-center"
      @click="emit('openOutput')"
    />
  </div>
</template>
