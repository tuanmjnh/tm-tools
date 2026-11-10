<script setup lang="ts">
import { getPresetErrorMessage } from '~/shared/utils/errors'
import type { PdfExtractPreset } from '#shared/types/pdf'
import {
  parsePresetFile,
  presetFileName,
  serializePresetFile,
  type PresetTransferEntry
} from '#shared/utils/presetTransfer'

const props = defineProps<{
  open: boolean
  preset: PdfExtractPreset | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': [id: string]
}>()

const { t } = useI18n()
const notify = useNotify()

const form = ref({ id: '', name: '', description: '', sample: '' })
const saving = ref(false)
const error = ref('')
const notice = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const isEditing = computed(() => Boolean(props.preset?.id))

watch(() => props.open, (open) => {
  if (!open) return
  form.value = {
    id: props.preset?.id || '',
    name: props.preset?.name || '',
    description: props.preset?.description || '',
    sample: props.preset?.sample || ''
  }
  error.value = ''
  notice.value = ''
}, { immediate: true })

function saveJsonFile(content: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function exportCurrent() {
  const name = form.value.name.trim()
  if (!name) {
    error.value = t('pdf.extract.presetNameRequired')
    return
  }
  saveJsonFile(
    serializePresetFile([{
      id: form.value.id || undefined,
      name,
      description: form.value.description,
      sample: form.value.sample
    }]),
    presetFileName(name)
  )
  notify.success(t('pdf.extract.presetExported'), name)
}

function pickFile() {
  fileInput.value?.click()
}

async function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const parsed = parsePresetFile(await file.text())
  if (!parsed.ok) {
    error.value = parsed.error === 'not-json'
      ? t('pdf.extract.presetImportNotJson')
      : parsed.error === 'empty'
        ? t('pdf.extract.presetImportEmpty')
        : t('pdf.extract.presetImportBadShape')
    return
  }
  applyImported(parsed.entries[0]!)
}

function applyImported(entry: PresetTransferEntry) {
  form.value = {
    id: entry.id && entry.id === form.value.id ? entry.id : '',
    name: entry.name,
    description: entry.description ?? '',
    sample: entry.sample ?? ''
  }
  error.value = ''
  notice.value = t('pdf.extract.presetImportLoaded', { name: entry.name })
}

async function save() {
  const name = form.value.name.trim()
  if (!name) {
    error.value = t('pdf.extract.presetNameRequired')
    return
  }
  saving.value = true
  error.value = ''
  try {
    const body: Record<string, unknown> = {
      name,
      description: form.value.description,
      sample: form.value.sample
    }
    if (form.value.id) body.id = form.value.id
    const res = await $fetch<{ data: PdfExtractPreset }>('/api/v1/pdf/extract/presets', { method: 'POST', body })
    emit('update:open', false)
    if (res?.data?.id) emit('saved', res.data.id)
    notify.success(t('pdf.extract.presetSaved'))
  } catch (err: unknown) {
    error.value = getPresetErrorMessage(err, key => t(key))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="isEditing ? t('pdf.extract.presetEditTitle') : t('pdf.extract.presetNewTitle')"
    @update:open="value => emit('update:open', value)"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-if="!isEditing"
            icon="i-lucide-upload"
            color="neutral"
            variant="soft"
            size="sm"
            :label="t('pdf.extract.presetImport')"
            @click="pickFile"
          />
          <UButton
            v-else
            icon="i-lucide-download"
            color="neutral"
            variant="soft"
            size="sm"
            :label="t('pdf.extract.presetExport')"
            :disabled="!form.name.trim()"
            @click="exportCurrent"
          />
        </div>
        <UFormField :label="t('pdf.extract.presetName')" required>
          <UInput v-model="form.name" class="w-full" :maxlength="80" />
        </UFormField>
        <UFormField :label="t('pdf.extract.presetDescription')" :description="t('pdf.extract.presetDescriptionHint')">
          <UTextarea
            v-model="form.description"
            class="w-full"
            :rows="4"
            :maxrows="8"
            autoresize
          />
        </UFormField>
        <UFormField :label="t('pdf.extract.presetSample')" :description="t('pdf.extract.presetSampleHint')">
          <UTextarea
            v-model="form.sample"
            class="w-full"
            :rows="5"
            :maxrows="10"
            autoresize
          />
        </UFormField>
        <p v-if="notice" class="text-xs text-success">
          {{ notice }}
        </p>
        <p v-if="error" class="text-xs text-error">
          {{ error }}
        </p>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          @change="onFileChosen"
        >
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="t('global.cancel')"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="emit('update:open', false)"
        />
        <UButton
          :label="t('pdf.extract.presetSave')"
          color="primary"
          variant="soft"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
