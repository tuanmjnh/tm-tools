<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: { createSubfolder?: boolean }
}>(), {
  modelValue: () => ({ createSubfolder: true })
})

const emit = defineEmits<{
  'update:modelValue': [value: { createSubfolder: boolean }]
}>()

const { t } = useI18n()

const createSubfolder = computed({
  get: () => props.modelValue?.createSubfolder !== false,
  set: (val: boolean) => emit('update:modelValue', { ...props.modelValue, createSubfolder: val })
})

function toggleSubfolder() {
  createSubfolder.value = !createSubfolder.value
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-col w-full">
      <button
        type="button"
        class="panel-flat flex w-full items-start gap-3 rounded-md p-3 text-start transition-all cursor-pointer"
        :class="[
          createSubfolder
            ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
            : 'border-default hover:border-default/80 hover:bg-muted/10'
        ]"
        @click="toggleSubfolder"
      >
        <div
          class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors text-white"
          :class="createSubfolder ? 'border-primary bg-primary text-primary-foreground' : 'border-gray-500 bg-transparent'"
        >
          <UIcon v-if="createSubfolder" name="i-lucide-check" class="size-3" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <!-- <UIcon name="i-lucide-folder-plus" class="size-4 shrink-0 text-primary" /> -->
            <p class="text-sm font-medium">
              {{ t('document.split.subfolderLabel') }}
            </p>
          </div>
        </div>
      </button>
      <p class="flex w-full text-xs text-muted mt-1 leading-relaxed">
        {{ t('document.split.subfolderDesc') }}
      </p>
    </div>

    <p class="rounded-md bg-muted/20 p-2 text-xs text-muted">
      {{ t('document.split.configHint') }}
    </p>
  </div>
</template>
