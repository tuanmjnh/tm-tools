<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { getErrorMessage, getPresetErrorMessage } from '~/shared/utils/errors'
import type { PdfExtractPreset, PdfOfficeFormat } from '#shared/types/pdf'
import {
  PRESET_MAX_COUNT,
  mergePresets,
  parsePresetFile,
  presetFileName,
  serializePresetFile,
  type PresetTransferEntry
} from '#shared/utils/presetTransfer'

interface ExtractModel {
  connectionId: string
  connectionName: string
  provider: string
  modelId: string
  displayName: string
  isDefault: boolean
}

interface ExtractModelValue {
  model?: string
  connectionId?: string
  presetId?: string
  formats?: PdfOfficeFormat[]
  force?: boolean
}

const props = defineProps<{
  modelValue?: ExtractModelValue
}>()

const emit = defineEmits<{
  'update:modelValue': [val: ExtractModelValue]
}>()

const { t } = useI18n()
const notify = useNotify()

const selectedModel = ref(props.modelValue?.model || '')
const selectedConnectionId = ref(props.modelValue?.connectionId || '')
const selectedPresetId = ref(props.modelValue?.presetId || '__none__')
const selectedFormats = ref<PdfOfficeFormat[]>(props.modelValue?.formats || ['csv']) // , 'xlsx', 'json', 'docx', 'xml'
const force = ref(Boolean(props.modelValue?.force))

const modelList = ref<ExtractModel[]>([])
const modelsLoading = ref(true)
const modelsError = ref('')
const presets = ref<PdfExtractPreset[]>([])

const presetEditorOpen = ref(false)
const editingPreset = ref<PdfExtractPreset | null>(null)
const presetDeleteOpen = ref(false)
const presetDeleting = ref(false)
const presetDeleteTarget = ref<PdfExtractPreset | null>(null)
const presetFileInput = ref<HTMLInputElement | null>(null)
const presetImporting = ref(false)

const selectedPreset = computed(() => presets.value.find(preset => preset.id === selectedPresetId.value) || null)

const presetMenu = computed<DropdownMenuItem[][]>(() => [
  [{
    label: t('pdf.extract.presetNewTitle'),
    icon: 'i-lucide-plus',
    onSelect: () => openPresetEditor()
  }],
  [
    {
      label: t('pdf.extract.presetEditTitle'),
      icon: 'i-lucide-pencil',
      disabled: !selectedPreset.value,
      onSelect: () => openPresetEditor(selectedPreset.value || undefined)
    },
    {
      label: t('pdf.extract.presetDelete'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      disabled: !selectedPreset.value,
      onSelect: () => askDeletePreset()
    }
  ],
  [
    {
      label: t('pdf.extract.presetExport'),
      icon: 'i-lucide-download',
      disabled: !selectedPreset.value,
      onSelect: () => exportSelectedPreset()
    },
    {
      label: t('pdf.extract.presetImportMany'),
      icon: 'i-lucide-upload',
      onSelect: () => pickPresetFile()
    }
  ]
])

const formatOptions: { format: PdfOfficeFormat, label: string, icon: string, hintKey: string }[] = [
  { format: 'csv', label: 'CSV', icon: 'i-lucide-table-2', hintKey: 'pdf.formats.csvHint' },
  { format: 'xlsx', label: 'Excel (XLSX)', icon: 'i-lucide-file-spreadsheet', hintKey: 'pdf.formats.xlsxHint' },
  { format: 'json', label: 'JSON', icon: 'i-lucide-braces', hintKey: 'pdf.formats.jsonHint' },
  { format: 'docx', label: 'Word (DOCX)', icon: 'i-lucide-file-type-2', hintKey: 'pdf.formats.docxHint' },
  { format: 'xml', label: 'XML', icon: 'i-lucide-code-xml', hintKey: 'pdf.formats.xmlHint' }
]

function emitUpdate() {
  emit('update:modelValue', {
    model: selectedModel.value,
    connectionId: selectedConnectionId.value,
    presetId: selectedPresetId.value,
    formats: selectedFormats.value,
    force: force.value
  })
}

watch([selectedModel, selectedConnectionId, selectedPresetId, selectedFormats, force], emitUpdate, { deep: true })

function selectDefaultModel() {
  const fallback = modelList.value.find(model => model.isDefault) ?? modelList.value[0]
  if (!fallback) return
  selectedModel.value = fallback.modelId
  selectedConnectionId.value = fallback.connectionId
}

async function fetchModels(reload = false) {
  modelsLoading.value = true
  modelsError.value = ''
  try {
    const res = await $fetch<{ data: ExtractModel[] }>(
      reload ? '/api/v1/pdf/extract/models?refresh=1' : '/api/v1/pdf/extract/models'
    )
    modelList.value = res.data || []
    const stillListed = modelList.value.some(model =>
      model.modelId === selectedModel.value && model.connectionId === selectedConnectionId.value)
    if (!stillListed) selectDefaultModel()
  } catch (err: unknown) {
    modelList.value = []
    modelsError.value = getErrorMessage(err, key => t(key))
  } finally {
    modelsLoading.value = false
  }
}

async function fetchPresets() {
  try {
    const res = await $fetch<{ data: PdfExtractPreset[] }>('/api/v1/pdf/extract/presets')
    presets.value = res.data || []
  } catch {
    presets.value = []
  }
  if (selectedPresetId.value !== '__none__' && !presets.value.some(preset => preset.id === selectedPresetId.value)) {
    selectedPresetId.value = '__none__'
  }
}

function onModelSelected(modelId: string) {
  selectedModel.value = modelId
  const match = modelList.value.find(model => model.modelId === modelId)
  if (match) selectedConnectionId.value = match.connectionId
}

function toggleFormat(fmt: PdfOfficeFormat) {
  selectedFormats.value = selectedFormats.value.includes(fmt)
    ? selectedFormats.value.filter(f => f !== fmt)
    : [...selectedFormats.value, fmt]
}

function openPresetEditor(preset?: PdfExtractPreset) {
  editingPreset.value = preset || null
  presetEditorOpen.value = true
}

async function onPresetSaved(id: string) {
  await fetchPresets()
  selectedPresetId.value = id
}

function askDeletePreset() {
  if (!selectedPreset.value) return
  presetDeleteTarget.value = selectedPreset.value
  presetDeleteOpen.value = true
}

async function removePreset() {
  const target = presetDeleteTarget.value
  if (!target) return
  presetDeleting.value = true
  try {
    await $fetch(`/api/v1/pdf/extract/presets/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
    presetDeleteOpen.value = false
    presetDeleteTarget.value = null
    if (selectedPresetId.value === target.id) selectedPresetId.value = '__none__'
    await fetchPresets()
    notify.success(t('pdf.extract.presetDeleted'))
  } catch (err: unknown) {
    presetDeleteOpen.value = false
    notify.error(t('pdf.extract.presetDelete'), getPresetErrorMessage(err, key => t(key)))
  } finally {
    presetDeleting.value = false
  }
}

function saveJsonFile(content: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function exportSelectedPreset() {
  const preset = selectedPreset.value
  if (!preset) return
  saveJsonFile(
    serializePresetFile([{
      id: preset.id,
      name: preset.name,
      description: preset.description,
      sample: preset.sample
    }]),
    presetFileName(preset.name)
  )
  notify.success(t('pdf.extract.presetExported'), preset.name)
}

function pickPresetFile() {
  presetFileInput.value?.click()
}

async function onPresetFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const parsed = parsePresetFile(await file.text())
  if (!parsed.ok) {
    presetImportFailure(parsed.error)
    return
  }
  await importPresetList(parsed.entries)
}

function presetImportFailure(reason: 'not-json' | 'invalid-shape' | 'empty') {
  const message = reason === 'not-json'
    ? t('pdf.extract.presetImportNotJson')
    : reason === 'empty'
      ? t('pdf.extract.presetImportEmpty')
      : t('pdf.extract.presetImportBadShape')
  notify.error(t('pdf.extract.presetImportMany'), message)
}

async function importPresetList(entries: PresetTransferEntry[]) {
  const plan = mergePresets(presets.value, entries)
  if (!plan.added.length) {
    notify.warning(
      t('pdf.extract.presetImportMany'),
      plan.skipped ? t('pdf.extract.presetImportNothingNew', { skipped: plan.skipped }) : t('pdf.extract.presetLimit')
    )
    return
  }

  presetImporting.value = true
  const failures: string[] = []
  let imported = 0
  let firstId = ''
  try {
    for (const entry of plan.added) {
      try {
        const res = await $fetch<{ data: PdfExtractPreset }>('/api/v1/pdf/extract/presets', {
          method: 'POST',
          body: {
            ...(entry.id ? { id: entry.id } : {}),
            name: entry.name,
            description: entry.description ?? '',
            sample: entry.sample ?? ''
          }
        })
        if (res?.data?.id) {
          imported++
          firstId ||= res.data.id
        }
      } catch (err: unknown) {
        failures.push(`${entry.name}: ${getPresetErrorMessage(err, key => t(key))}`)
      }
    }
    await fetchPresets()
    if (firstId) selectedPresetId.value = firstId

    const skipped = plan.skipped + plan.overflow + (plan.added.length - imported)
    if (imported) {
      notify.success(
        t('pdf.extract.presetImportMany'),
        t('pdf.extract.presetImportResult', { imported, skipped, cap: PRESET_MAX_COUNT })
      )
    }
    if (failures.length) notify.error(t('pdf.extract.presetImportMany'), failures.slice(0, 3).join(' · '))
  } finally {
    presetImporting.value = false
  }
}

onMounted(async () => {
  await Promise.all([fetchModels(), fetchPresets()])
})
</script>

<template>
  <div class="space-y-4">
    <!-- Model selection -->
    <UFormField :label="t('pdf.extract.model')">
      <div v-if="modelsLoading" class="flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t('common.loading') }}
      </div>
      <UAlert
        v-else-if="modelsError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="t('pdf.extract.modelsUnavailable')"
        :description="modelsError"
      >
        <template #actions>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :label="t('common.refresh')"
            :loading="modelsLoading"
            @click="fetchModels(true)"
          />
          <UButton
            size="sm"
            to="/system/settings/hub"
            color="neutral"
            variant="ghost"
            icon="i-lucide-plug"
            :label="t('settings.hub.title')"
          />
        </template>
      </UAlert>
      <USelect
        v-else-if="modelList.length"
        :model-value="selectedModel"
        :items="modelList.map(model => ({ label: `${model.displayName} (${model.connectionName})`, value: model.modelId }))"
        class="w-full"
        @update:model-value="onModelSelected"
      />
      <div v-else class="space-y-2">
        <p class="text-xs text-muted">
          {{ t('pdf.extract.noModelSelected') }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :label="t('common.refresh')"
            :loading="modelsLoading"
            @click="fetchModels(true)"
          />
          <UButton
            size="sm"
            to="/system/settings/hub"
            color="neutral"
            variant="ghost"
            icon="i-lucide-plug"
            :label="t('settings.hub.title')"
          />
        </div>
      </div>
    </UFormField>

    <!-- Preset selection -->
    <UFormField :label="t('pdf.extract.presets')">
      <div class="flex items-center gap-2">
        <USelect
          v-model="selectedPresetId"
          :items="[
            { label: t('pdf.extract.presetDefault'), value: '__none__' },
            ...presets.map(preset => ({ label: preset.name, value: preset.id }))
          ]"
          class="w-full min-w-0"
        />
        <UDropdownMenu :items="presetMenu">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            square
            class="shrink-0"
            :loading="presetImporting"
            :aria-label="t('pdf.extract.presets')"
          />
        </UDropdownMenu>
        <input
          ref="presetFileInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          @change="onPresetFileChosen"
        >
      </div>
      <p v-if="selectedPreset?.description" class="mt-1 text-[11px] leading-relaxed text-muted">
        {{ selectedPreset.description }}
      </p>
    </UFormField>

    <!-- Export formats -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label class="text-xs font-semibold uppercase tracking-wide text-muted">
          {{ t('pdf.extract.outputFormats') }}
        </label>
        <span class="text-[11px] font-medium text-muted">
          {{ selectedFormats.length }} / {{ formatOptions.length }}
        </span>
      </div>
      <div class="flex flex-col gap-2">
        <button
          v-for="item in formatOptions"
          :key="item.format"
          type="button"
          class="panel-flat flex items-start gap-3 rounded-lg p-3 text-start transition-all cursor-pointer"
          :class="[
            selectedFormats.includes(item.format)
              ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
              : 'hover:border-primary/50 hover:bg-muted/10'
          ]"
          :aria-pressed="selectedFormats.includes(item.format)"
          @click="toggleFormat(item.format)"
        >
          <div
            class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors"
            :class="[
              selectedFormats.includes(item.format)
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-default/60 bg-muted/15 text-muted'
            ]"
          >
            <UIcon
              :name="selectedFormats.includes(item.format) ? 'i-lucide-check-circle-2' : item.icon"
              class="size-4"
            />
          </div>
          <div class="min-w-0 flex-1 space-y-0.5">
            <div class="flex items-center justify-between gap-2">
              <span
                class="text-xs font-semibold text-highlighted"
                :class="{ 'text-primary': selectedFormats.includes(item.format) }"
              >
                {{ item.label }}
              </span>
              <span
                v-if="selectedFormats.includes(item.format)"
                class="text-[10px] font-medium uppercase tracking-wider text-primary"
              >
                {{ t('pdf.browser.selected') }}
              </span>
            </div>
            <p class="text-[11px] leading-relaxed text-muted">
              {{ t(item.hintKey) }}
            </p>
          </div>
        </button>
      </div>
    </div>

    <!-- Force re-extract checkbox -->
    <div class="flex items-center gap-2 pt-1 pb-2">
      <input
        id="force-check"
        v-model="force"
        type="checkbox"
        class="size-3.5"
      >
      <label for="force-check" class="text-xs text-muted cursor-pointer">
        {{ t('pdf.extract.force') }}
      </label>
    </div>

    <LazyDocumentStudioOperationsConfigsExtractPresetModal
      v-model:open="presetEditorOpen"
      :preset="editingPreset"
      @saved="onPresetSaved"
    />

    <BaseConfirmModal
      v-model:open="presetDeleteOpen"
      :title="t('pdf.extract.presetDelete')"
      :description="t('pdf.extract.presetDeleteConfirm', { name: presetDeleteTarget?.name || '' })"
      :confirm-label="t('pdf.extract.presetDelete')"
      :loading="presetDeleting"
      @confirm="removePreset"
    />
  </div>
</template>
