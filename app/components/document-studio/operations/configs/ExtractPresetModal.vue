<script setup lang="ts">
import { getPresetErrorMessage } from '~/shared/utils/errors'
import type { PdfCategoryMatchMode, PdfCategoryNode, PdfExtractPreset } from '#shared/types/pdf'
import {
  applyCategoryMapping,
  guessCategoryColumns,
  parseCategoryImport,
  type CategoryColumnMapping,
  type CategoryImportTable
} from '#shared/utils/pdfCategoryTree'
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

const form = ref<{
  id: string
  name: string
  description: string
  sample: string
  categoryMode: PdfCategoryMatchMode
  categories: PdfCategoryNode[]
}>({
  id: '',
  name: '',
  description: '',
  sample: '',
  categoryMode: 'auto',
  categories: []
})
const saving = ref(false)
const error = ref('')
const notice = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const importedTable = ref<CategoryImportTable | null>(null)
const columnMapping = ref<CategoryColumnMapping>({ title: '', slug: '', pid: '', matchers: '' })

const isEditing = computed(() => Boolean(props.preset?.id))

const categoryModeOptions = computed(() => [
  { label: t('pdf.extract.presetCategoryModeAuto'), value: 'auto' },
  { label: t('pdf.extract.presetCategoryModeSystem'), value: 'system' },
  { label: t('pdf.extract.presetCategoryModeAi'), value: 'ai' }
])

const headerOptions = computed(() =>
  (importedTable.value?.headers ?? []).map(h => ({ label: h, value: h }))
)

const NONE_COL = '__none__'

const optionalHeaderOptions = computed(() => [
  { label: '—', value: NONE_COL },
  ...headerOptions.value
])

watch(() => props.open, (open) => {
  if (!open) return
  form.value = {
    id: props.preset?.id || '',
    name: props.preset?.name || '',
    description: props.preset?.description || '',
    sample: props.preset?.sample || '',
    categoryMode: props.preset?.categoryMode || 'auto',
    categories: props.preset?.categories ? [...props.preset.categories] : []
  }
  importedTable.value = null
  error.value = ''
  notice.value = ''
}, { immediate: true })

watch(columnMapping, (mapping) => {
  if (!importedTable.value) return
  form.value.categories = applyCategoryMapping(importedTable.value, {
    title: mapping.title,
    slug: mapping.slug,
    pid: mapping.pid === NONE_COL ? '' : mapping.pid,
    matchers: mapping.matchers === NONE_COL ? '' : mapping.matchers
  })
}, { deep: true })

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
      sample: form.value.sample,
      ...(form.value.categories.length ? { categoryMode: form.value.categoryMode, categories: form.value.categories } : {})
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
    sample: entry.sample ?? '',
    categoryMode: entry.categoryMode ?? 'auto',
    categories: entry.categories ? [...entry.categories] : []
  }
  importedTable.value = null
  error.value = ''
  notice.value = t('pdf.extract.presetImportLoaded', { name: entry.name })
}

function pickCategoryFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.csv,application/json,text/csv'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const table = parseCategoryImport(await file.text())
    if (!table) {
      error.value = t('pdf.extract.presetCategoryBadFile')
      return
    }
    importedTable.value = table
    const guessed = guessCategoryColumns(table.headers)
    columnMapping.value = {
      title: guessed.title,
      slug: guessed.slug,
      pid: guessed.pid || NONE_COL,
      matchers: guessed.matchers || NONE_COL
    }
    form.value.categories = applyCategoryMapping(table, guessed)
    error.value = ''
  }
  input.click()
}

function clearCategories() {
  importedTable.value = null
  form.value.categories = []
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
    if (form.value.categories.length) {
      body.categoryMode = form.value.categoryMode
      body.categories = form.value.categories
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
        <div class="space-y-3 rounded-md border border-default/60 bg-muted/5 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-medium">
                {{ t('pdf.extract.presetCategoryTitle') }}
              </p>
              <p class="text-xs text-muted">
                {{ t('pdf.extract.presetCategoryHint') }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                icon="i-lucide-folder-tree"
                color="neutral"
                variant="soft"
                size="xs"
                :label="t('pdf.extract.presetCategoryImport')"
                @click="pickCategoryFile"
              />
              <UButton
                v-if="form.categories.length"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                :label="t('pdf.extract.presetCategoryClear')"
                @click="clearCategories"
              />
            </div>
          </div>
          <div v-if="importedTable" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <UFormField :label="t('pdf.extract.presetCategoryColTitle')">
              <USelect
                v-model="columnMapping.title"
                :items="headerOptions"
                value-key="value"
                class="w-full"
                size="xs"
              />
            </UFormField>
            <UFormField :label="t('pdf.extract.presetCategoryColSlug')">
              <USelect
                v-model="columnMapping.slug"
                :items="headerOptions"
                value-key="value"
                class="w-full"
                size="xs"
              />
            </UFormField>
            <UFormField :label="t('pdf.extract.presetCategoryColPid')">
              <USelect
                v-model="columnMapping.pid"
                :items="optionalHeaderOptions"
                value-key="value"
                class="w-full"
                size="xs"
              />
            </UFormField>
            <UFormField :label="t('pdf.extract.presetCategoryColMatchers')">
              <USelect
                v-model="columnMapping.matchers"
                :items="optionalHeaderOptions"
                value-key="value"
                class="w-full"
                size="xs"
              />
            </UFormField>
          </div>
          <div v-if="form.categories.length" class="space-y-2">
            <div class="flex items-center gap-2">
              <UBadge color="primary" variant="subtle" size="xs">
                {{ t('pdf.extract.presetCategoryLoaded', { count: form.categories.length }) }}
              </UBadge>
            </div>
            <UFormField :label="t('pdf.extract.presetCategoryMode')">
              <USelect
                v-model="form.categoryMode"
                :items="categoryModeOptions"
                value-key="value"
                class="w-full"
                size="sm"
              />
            </UFormField>
          </div>
        </div>
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
