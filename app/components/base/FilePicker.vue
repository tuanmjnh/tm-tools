<script setup lang="ts">
import type { DialogFileFilter } from '~/types'

const model = defineModel<string>({ default: '' })

const props = withDefaults(defineProps<{
  placeholder?: string
  mode?: 'file' | 'folder' | 'save'
  filters?: DialogFileFilter[]
  title?: string
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
}>(), {
  placeholder: '',
  mode: 'file',
  filters: () => [] as DialogFileFilter[],
  title: '',
  size: 'md',
  disabled: false,
  loading: false
})

const { t } = useI18n()
const { pickFile, pickFolder, selectSaveFile } = useFileSystem()
const isElectron = computed(() => !!window.electronAPI?.isElectron)

async function browse() {
  if (!isElectron.value) return
  try {
    if (props.mode === 'folder') {
      const picked = await pickFolder({ title: props.title })
      if (picked) model.value = picked
      return
    }
    if (props.mode === 'save') {
      const picked = await selectSaveFile({ title: props.title, filters: props.filters })
      if (picked) model.value = picked
      return
    }
    const picked = await pickFile({ title: props.title, filters: props.filters })
    if (typeof picked === 'string' && picked) model.value = picked
  } catch {
    // ignore
  }
}
</script>

<template>
  <UInput
    v-model="model"
    :placeholder="placeholder"
    :size="size"
    :disabled="disabled"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-folder-open"
        :title="t('tools.browse')"
        :aria-label="t('tools.browse')"
        :disabled="disabled || !isElectron"
        :loading="loading"
        @click="browse"
      />
    </template>
  </UInput>
</template>
