<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileInfo } from '#shared/types/pdf'
import type { AvailableModel } from '~/types/chat'
import { pdfParentPath } from '~/utils/pdfStudio'

const { t } = useI18n()
const { formatDateTime } = useDateTime()
const notify = useNotify()
const {
  library,
  jobs,
  busy,
  refresh,
  refreshJobs,
  refreshLibrary,
  upload,
  startExtraction,
  cancelJob,
  removeProduct
} = usePdfStudio()
const { workspaceItems, refreshItem, folderItems, copyText } = usePdfMenus()

const dir = usePdfDirectory('sources')

interface ExtractModel {
  connectionId: string
  connectionName: string
  provider: string
  modelId: string
  displayName: string
  isDefault: boolean
}

interface ExtractPreset {
  id: string
  name: string
  description: string
  sample: string
  updatedAt: string
}

const selectedSource = ref('')
const selectedModel = ref('')
const modelList = ref<ExtractModel[]>([])
const modelsLoading = ref(true)
const PRESET_NONE = '__none__'
const presets = ref<ExtractPreset[]>([])
const selectedPresetId = ref(PRESET_NONE)
const presetOpen = ref(false)
const presetSaving = ref(false)
const presetDraft = reactive({ id: '', name: '', description: '', sample: '' })
const force = ref(false)
const overwrite = ref(true)
const pendingDelete = ref<string | null>(null)
const confirmOpen = ref(false)

let poll: ReturnType<typeof setInterval> | null = null
let wasRunning = false

async function reloadAll() {
  await Promise.all([refresh(), dir.loadDirectory(dir.currentFolder.value)])
}

function pickSource(file: PdfFileInfo) {
  selectedSource.value = file.relativePath || file.name
}

async function handleUpload(files: File[]) {
  await upload(files, dir.currentFolder.value)
  await reloadAll()
}

const extractorModels = computed<AvailableModel[]>(() =>
  modelList.value.map(model => ({
    connectionId: model.connectionId,
    connectionName: model.connectionName,
    provider: model.provider as AvailableModel['provider'],
    modelId: model.modelId,
    displayName: model.displayName
  }))
)

const noModels = computed(() => !modelsLoading.value && modelList.value.length === 0)

async function loadModels() {
  modelsLoading.value = true
  try {
    const res = await $fetch<{ data: ExtractModel[] }>('/api/v1/pdf/extract/models?refresh=1')
    modelList.value = res.data ?? []
  } catch {
    modelList.value = []
  } finally {
    modelsLoading.value = false
  }
}

const selectedTarget = computed(() => {
  const index = selectedModel.value.lastIndexOf(':')
  if (index < 0) return null
  return {
    connectionId: selectedModel.value.slice(0, index),
    model: selectedModel.value.slice(index + 1).replace(/^models\//, '')
  }
})
const selectedPreset = computed(() =>
  selectedPresetId.value === PRESET_NONE
    ? null
    : presets.value.find(preset => preset.id === selectedPresetId.value) ?? null
)
const presetItems = computed(() => [
  { label: t('pdf.extract.presetDefault'), value: PRESET_NONE },
  ...presets.value.map(preset => ({ label: preset.name, value: preset.id }))
])
const products = computed(() => library.value?.products ?? [])

const pageMenu = computed<DropdownMenuItem[][]>(() => [
  [
    refreshItem(reloadAll),
    {
      label: t('pdf.extract.jobs'),
      icon: 'i-lucide-refresh-cw',
      onSelect: () => void refreshJobs()
    }
  ],
  workspaceItems('extract'),
  folderItems(pdfParentPath(products.value[0]?.path)).slice(0, 2)
].filter(group => group.length > 0))

function jobMenu(job: { id: string, source: string, status: string }): DropdownMenuItem[][] {
  const groups: DropdownMenuItem[][] = [
    [{
      label: t('pdf.extract.copySource'),
      icon: 'i-lucide-clipboard',
      onSelect: () => void copyText(job.source)
    }]
  ]
  if (job.status === 'running' || job.status === 'queued') {
    groups.push([{
      label: t('pdf.extract.cancel'),
      icon: 'i-lucide-square',
      color: 'warning',
      onSelect: () => void cancelJob(job.id)
    }])
  }
  return groups
}

function productMenu(file: PdfFileInfo): DropdownMenuItem[] {
  const baseName = file.name.replace(/\.[^.]+$/, '')
  return [{
    label: t('pdf.workspaces.export.title'),
    icon: 'i-lucide-share-2',
    onSelect: () => void navigateTo(`/pdf/export?source=${encodeURIComponent(baseName)}`)
  }]
}
const hasRunning = computed(() => jobs.value.some(job => job.status === 'running' || job.status === 'queued'))
const canStart = computed(() => Boolean(selectedSource.value) && !hasRunning.value && busy.value === null)

async function loadPresets() {
  try {
    const res = await $fetch<{ data: ExtractPreset[] }>('/api/v1/pdf/extract/presets')
    presets.value = res.data ?? []
  } catch {
    presets.value = []
  }
}

function openPresetModal(preset?: ExtractPreset | null) {
  if (preset) {
    presetDraft.id = preset.id
    presetDraft.name = preset.name
    presetDraft.description = preset.description
    presetDraft.sample = preset.sample
  } else {
    presetDraft.id = ''
    presetDraft.name = ''
    presetDraft.description = ''
    presetDraft.sample = ''
  }
  presetOpen.value = true
}

async function savePresetDraft() {
  if (!presetDraft.name.trim()) return
  presetSaving.value = true
  try {
    const res = await $fetch<{ data: ExtractPreset }>('/api/v1/pdf/extract/presets', {
      method: 'POST',
      body: {
        id: presetDraft.id || undefined,
        name: presetDraft.name.trim(),
        description: presetDraft.description,
        sample: presetDraft.sample
      }
    })
    presetOpen.value = false
    await loadPresets()
    selectedPresetId.value = res.data.id
    notify.success(t('pdf.extract.presetSave'), t('pdf.extract.presetSaved'))
  } catch {
    notify.error(t('pdf.extract.presetSave'), t('pdf.errors.generic'))
  } finally {
    presetSaving.value = false
  }
}

async function deletePreset() {
  const preset = selectedPreset.value
  if (!preset) return
  try {
    await $fetch(`/api/v1/pdf/extract/presets/${encodeURIComponent(preset.id)}`, { method: 'DELETE' })
    selectedPresetId.value = PRESET_NONE
    await loadPresets()
    notify.info(t('pdf.extract.presetDelete'), t('pdf.extract.presetDeleted'))
  } catch {
    notify.error(t('pdf.extract.presetDelete'), t('pdf.errors.generic'))
  }
}

onMounted(async () => {
  await reloadAll()
  const first = dir.files.value[0]
  if (!selectedSource.value && first) selectedSource.value = first.relativePath || first.name
  void loadModels()
  void loadPresets()
  poll = setInterval(() => {
    if (!hasRunning.value) {
      if (wasRunning) {
        wasRunning = false
        void refreshLibrary().catch(() => undefined)
      }
      return
    }
    wasRunning = true
    void refreshJobs().catch(() => undefined)
  }, PDF_STUDIO_POLL_MS)
})

onUnmounted(() => {
  if (poll) clearInterval(poll)
})

watch(extractorModels, (models) => {
  if (models.some(model => `${model.connectionId}:${model.modelId}` === selectedModel.value)) return
  const first = models[0]
  selectedModel.value = first ? `${first.connectionId}:${first.modelId}` : ''
}, { immediate: true })

async function start() {
  if (!canStart.value) return
  const preset = selectedPreset.value
  await startExtraction(
    selectedSource.value,
    force.value,
    selectedTarget.value ? { connectionId: selectedTarget.value.connectionId, model: selectedTarget.value.model } : null,
    preset ? { preset: preset.id, description: preset.description, sample: preset.sample } : null,
    overwrite.value
  )
}

const EXTRACT_FORMATS = ['csv', 'json', 'xlsx', 'docx', 'xml'] as const
type ExtractFormat = typeof EXTRACT_FORMATS[number]
const PREF_FORMATS_KEY = 'tm:pdf:extract:formats'
const outputFormats = ref<ExtractFormat[]>(['csv', 'json'])

watch(outputFormats, (values) => {
  if (!import.meta.client) return
  try {
    localStorage.setItem(PREF_FORMATS_KEY, JSON.stringify(values))
  } catch {
    // Ignore Storage quota/disabled errors.
  }
}, { deep: true })

onMounted(() => {
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(PREF_FORMATS_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return
    const valid = EXTRACT_FORMATS.filter(item => parsed.includes(item))
    if (valid.length) outputFormats.value = valid
  } catch {
    // Ignore a corrupted preference and keep the defaults.
  }
})

function askDelete(name: string) {
  pendingDelete.value = name
  confirmOpen.value = true
}

async function deleteSource(item: { path: string, relativePath?: string }) {
  await dir.handleDelete(item.relativePath || item.path)
  await reloadAll()
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  const name = pendingDelete.value
  confirmOpen.value = false
  pendingDelete.value = null
  await removeProduct(name)
  await reloadAll()
}
</script>

<template>
  <BasePage id="pdf-extract" :title="t('pdf.workspaces.extract.title')" :description="t('pdf.workspaces.extract.desc')">
    <template #right>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="xs"
        square
        :aria-label="t('pdf.actions.refresh')"
        :loading="busy === 'extract' || dir.dirLoading.value"
        @click="reloadAll"
      />
    </template>

    <PdfContextMenu :items="pageMenu">
      <PdfWorkspaceShell
        :tree="dir.tree.value"
        :current-folder="dir.currentFolder.value"
        area="sources"
        :loading="dir.dirLoading.value"
        @select="dir.loadDirectory"
        @create="dir.openCreateFolderModal"
        @rename="item => dir.openRenameModal({ name: item.name, relativePath: item.path }, true)"
        @delete="deleteSource"
      >
        <PdfFileBrowser
          area="sources"
          selectable
          :title="t('pdf.library.title')"
          :description="t('pdf.library.description')"
          :current-folder="dir.currentFolder.value"
          :folders="dir.folders.value"
          :files="dir.files.value"
          :breadcrumbs="dir.breadcrumbs.value"
          :parent-folder="dir.parentFolder.value"
          :loading="dir.dirLoading.value"
          :uploading="busy === 'upload'"
          :upload-accept="PDF_UPLOAD_ACCEPT"
          :upload-label="t('pdf.library.dropzone')"
          :upload-description="t('pdf.library.dropzoneDesc', { maxMb: library?.maxUploadMb ?? 0 })"
          :selected-path="selectedSource"
          list-class="max-h-[40vh]"
          @pick="pickSource"
          @upload="handleUpload"
          @refresh="reloadAll"
          @select-folder="dir.loadDirectory"
          @open-folder="folder => dir.loadDirectory(folder.relativePath || folder.name)"
          @rename-folder="folder => dir.openRenameModal(folder, true)"
          @delete-folder="deleteSource"
          @rename-file="file => dir.openRenameModal(file, false)"
        />

        <section class="panel shrink-0 p-4 space-y-3">
          <div class="grid gap-3 md:grid-cols-2 md:items-end">
            <UFormField :label="t('pdf.extract.model')">
              <AiProvidersModelSelect
                v-model="selectedModel"
                :models="extractorModels"
                :loading="modelsLoading"
                :disabled="hasRunning"
                width-class="w-full"
              />
            </UFormField>

            <UFormField :label="t('pdf.extract.preset')">
              <div class="flex min-w-0 items-center gap-1">
                <USelect
                  v-model="selectedPresetId"
                  :items="presetItems"
                  :disabled="hasRunning"
                  class="min-w-0 flex-1"
                />
                <UButton
                  icon="i-lucide-plus"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  :aria-label="t('pdf.extract.presetNewTitle')"
                  :title="t('pdf.extract.presetNewTitle')"
                  @click="openPresetModal(null)"
                />
                <UButton
                  v-if="selectedPreset"
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  :aria-label="t('pdf.extract.presetEditTitle')"
                  :title="t('pdf.extract.presetEditTitle')"
                  @click="openPresetModal(selectedPreset)"
                />
                <UButton
                  v-if="selectedPreset"
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  size="xs"
                  square
                  :aria-label="t('pdf.extract.presetDelete')"
                  :title="t('pdf.extract.presetDelete')"
                  @click="deletePreset"
                />
              </div>
            </UFormField>
          </div>

          <div class="space-y-2 border-t border-default pt-2">
            <p class="text-xs font-medium text-muted">
              {{ t('pdf.export.formats') }}
            </p>
            <div class="flex flex-wrap gap-x-4 gap-y-2">
              <UCheckbox
                v-for="fmt in EXTRACT_FORMATS"
                :key="fmt"
                :model-value="outputFormats.includes(fmt)"
                :label="fmt.toUpperCase()"
                @update:model-value="(val) => {
                  if (val) outputFormats.push(fmt)
                  else outputFormats = outputFormats.filter(f => f !== fmt)
                }"
              />
            </div>
          </div>

          <p v-if="hasRunning" class="flex items-center gap-2 text-xs text-muted">
            <UIcon name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin" />
            {{ t('pdf.extract.running') }}
          </p>

          <div v-if="noModels" class="flex items-start gap-2 text-xs text-(--ui-warning)">
            <UIcon name="i-lucide-plug-zap" class="size-4 shrink-0" />
            {{ t('pdf.errors.aiKeyMissing') }}
          </div>

          <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-default pt-3">
            <UCheckbox
              v-model="overwrite"
              :label="t('pdf.actions.overwrite')"
              :title="t('pdf.actions.overwriteHint')"
              :disabled="hasRunning"
            />
            <UButton
              icon="i-lucide-scan-text"
              :label="t('pdf.extract.start')"
              color="primary"
              variant="soft"
              size="xs"
              :disabled="!canStart"
              :loading="busy === 'extract'"
              @click="start"
            />
          </footer>
        </section>

        <section class="panel shrink-0">
          <header class="flex items-center justify-between gap-3 border-b border-default px-4 py-2.5">
            <div class="min-w-0">
              <h2 class="text-sm font-semibold">
                {{ t('pdf.extract.jobs') }}
              </h2>
              <p class="truncate text-xs text-muted">
                {{ t('pdf.extract.jobsDesc') }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <span class="mono text-xs text-muted">{{ jobs.length }}</span>
              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                size="xs"
                square
                :aria-label="t('pdf.actions.refresh')"
                @click="refreshJobs"
              />
            </div>
          </header>

          <div v-if="!jobs.length" class="space-y-1 px-4 py-6 text-center">
            <UIcon name="i-lucide-scan-text" class="mx-auto size-6 text-dimmed" />
            <p class="text-sm font-medium">
              {{ t('pdf.extract.empty') }}
            </p>
          </div>

          <div v-else class="max-h-[320px] divide-y divide-default overflow-y-auto scroll-thin">
            <PdfContextMenu v-for="job in jobs" :key="job.id" :items="jobMenu(job)">
              <article class="flex items-start justify-between gap-3 px-4 py-3">
                <div class="min-w-0 space-y-0.5">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate text-sm font-medium" :title="job.source">{{ job.source }}</span>
                    <UBadge :color="PDF_STATUS_META[job.status].color" variant="subtle" size="xs">
                      {{ t(`pdf.status.${job.status}`) }}
                    </UBadge>
                  </div>
                  <p class="flex items-center gap-1 text-xs text-muted">
                    <UIcon name="i-lucide-calendar-clock" class="size-3.5" />
                    {{ formatDateTime(job.createdAt) }}
                  </p>
                </div>

                <UDropdownMenu :items="jobMenu(job)" :content="{ align: 'end' }">
                  <UButton
                    icon="i-lucide-ellipsis-vertical"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    square
                    :aria-label="t('common.actions')"
                  />
                </UDropdownMenu>
              </article>
            </PdfContextMenu>
          </div>
        </section>

        <section class="panel shrink-0">
          <header class="flex items-center justify-between gap-3 border-b border-default px-4 py-2.5">
            <div class="min-w-0">
              <h2 class="text-sm font-semibold">
                {{ t('pdf.extract.results') }}
              </h2>
              <p class="truncate text-xs text-muted">
                {{ t('pdf.extract.resultsDesc') }}
              </p>
            </div>
            <span class="mono shrink-0 text-xs text-muted">{{ products.length }}</span>
          </header>

          <div v-if="!products.length" class="px-4 py-6 text-center text-xs text-muted">
            {{ t('pdf.extract.noResults') }}
          </div>

          <div v-else class="max-h-[320px] divide-y divide-default overflow-y-auto scroll-thin">
            <PdfFileRow
              v-for="file in products"
              :key="file.name"
              area="products"
              :name="file.name"
              :path="file.path"
              :size="file.size"
              :modified-at="file.modifiedAt"
              :menu="productMenu(file)"
              @delete="askDelete(file.name)"
            />
          </div>
        </section>
      </PdfWorkspaceShell>

      <UModal
        v-model:open="presetOpen"
        :title="presetDraft.id ? t('pdf.extract.presetEditTitle') : t('pdf.extract.presetNewTitle')"
        :ui="{ content: 'sm:max-w-4xl lg:max-w-5xl' }"
      >
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('pdf.extract.presetName')" required>
              <UInput v-model="presetDraft.name" :maxlength="80" class="w-full" />
            </UFormField>

            <UFormField :label="t('pdf.extract.presetDescription')" :help="t('pdf.extract.presetDescriptionHint')">
              <UTextarea
                v-model="presetDraft.description"
                :rows="3"
                :maxlength="6000"
                class="w-full"
              />
            </UFormField>

            <UFormField :label="t('pdf.extract.presetSample')" :help="t('pdf.extract.presetSampleHint')">
              <PdfPresetSampleEditor v-model="presetDraft.sample" :max-length="16000" />
            </UFormField>
          </div>
        </template>

        <template #footer>
          <div class="flex w-full items-center justify-end gap-2">
            <UButton
              :label="t('pdf.actions.cancel')"
              color="neutral"
              variant="ghost"
              @click="presetOpen = false"
            />
            <UButton
              :label="t('pdf.extract.presetSave')"
              color="primary"
              :loading="presetSaving"
              @click="savePresetDraft"
            />
          </div>
        </template>
      </UModal>

      <BaseConfirmModal
        v-model:open="confirmOpen"
        :title="t('pdf.convert.removeOutputTitle')"
        :description="t('pdf.convert.removeOutputDesc', { name: pendingDelete ?? '' })"
        :loading="busy === 'removeOutput'"
        @confirm="confirmDelete"
      />
    </PdfContextMenu>
  </BasePage>
</template>
