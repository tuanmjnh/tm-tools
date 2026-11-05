<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  icon?: string
  loading?: boolean
}>(), {
  description: '',
  confirmLabel: '',
  icon: 'i-lucide-play',
  loading: false
})

const open = defineModel<boolean>('open', { default: false })
const overwrite = defineModel<boolean>('overwrite', { default: true })
const emit = defineEmits<{ confirm: [] }>()
const { t } = useI18n()
</script>

<template>
  <UModal v-model:open="open" :title="title" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <div class="space-y-3">
        <div v-if="description" class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-[4px] bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
            <UIcon :name="icon" class="size-4" />
          </span>
          <p class="pt-1.5 text-sm leading-relaxed text-muted">
            {{ description }}
          </p>
        </div>

        <div class="rounded-[4px] bg-muted/10 px-3 py-2 ring-1 ring-inset ring-default/60">
          <UCheckbox
            v-model="overwrite"
            :label="t('pdf.actions.overwrite')"
            :disabled="props.loading"
          />
          <p class="pl-6 pt-0.5 text-xs leading-snug text-muted">
            {{ t('pdf.actions.overwriteHint') }}
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton
        :label="t('global.cancel')"
        color="neutral"
        variant="ghost"
        :disabled="props.loading"
        @click="open = false"
      />
      <UButton
        :label="confirmLabel || t('global.confirm')"
        color="primary"
        variant="soft"
        size="sm"
        :loading="props.loading"
        @click="emit('confirm')"
      />
    </template>
  </UModal>
</template>
