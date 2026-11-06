<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileInfo } from '#shared/types/pdf'
import type { AvailableModel } from '~/types/chat'
import { pdfParentPath } from '~/utils/pdfStudio'
import { pdfDocumentStem, pdfOperation, pdfProductsStem } from '~/utils/pdfOperations'

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
  cancelJob
} = usePdfStudio()
const { workspaceItems, refreshItem, folderItems, copyText } = usePdfMenus()

const explorer = usePdfExplorer(library)

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

const selection = usePdfSelection('extract')
const selectedSource = computed(() => selection.selection.value?.item.relativePath ?? '')
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
const pendingDelete = ref<{ name: string, path: string, area: PdfFileArea } | null>(null)
const deleteOpen = ref(false)

let poll: ReturnType<typeof setInterval> | null = null
let wasRunning = false

async function reloadAll() {
  await Promise.all([refresh(), explorer.reload()])
}

function pickSource(file: PdfFileInfo) {
  selection.pickFile({ area: explorer.activeArea.value, relativePath: file.relativePath || file.name, name: file.name })
}

async function handleUpload(files: File[]) {
  await upload(files, explorer.currentFolder.value)
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
const sourcePicker = computed(() => explorer.activeArea.value === 'sources')

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
  const started = await startExtraction(
    selectedSource.value,
    force.value,
    selectedTarget.value ? { connectionId: selectedTarget.value.connectionId, model: selectedTarget.value.model } : null,
    preset ? { preset: preset.id, description: preset.description, sample: preset.sample } : null,
    overwrite.value
  )
  if (started) {
    lastRunSource.value = selectedSource.value
    lastRunJobId.value = jobs.value.find(job => job.source === lastRunSource.value)?.id ?? ''
  }
}

const extractOperation = computed(() => pdfOperation('extract'))
const outputArea = computed(() => explorer.outputArea('extract'))

const flowInput = computed(() => {
  const item = selection.selection.value?.item
  return item ? { label: item.name, detail: item.relativePath } : { label: t('pdf.flow.none') }
})

async function openOutput() {
  if (outputArea.value) await explorer.select('', outputArea.value)
}

/** Products of the last started job, so a finished run can be summarised. */
const lastRunSource = ref('')
const lastRunJobId = ref('')

/** The job itself decides the outcome; a stopped poll is not a success. */
const lastRunStatus = computed<'success' | 'partial' | 'failed'>(() => {
  const job = jobs.value.find(entry => entry.id === lastRunJobId.value)
  if (!job) return 'partial'
  if (job.status === 'failed' || job.status === 'cancelled') return 'failed'
  if (job.status === 'queued' || job.status === 'running') return 'partial'
  return job.failedPages.length ? 'partial' : 'success'
})
const lastRunProducts = computed(() => {
  const stem = pdfDocumentStem(lastRunSource.value)
  if (!stem) return []
  const prefix = `${pdfProductsStem(stem)}.`
  return products.value.filter(file => file.name.startsWith(prefix))
})

/** The server always writes all five formats in one run; the list is information. */
const EXTRACT_FORMATS = ['csv', 'json', 'xlsx', 'docx', 'xml'] as const

const configOpen = ref(false)

const modelSummary = computed(() => {
  if (!selectedModel.value) return t('pdf.extract.noModelSelected')
  return `${t('pdf.extract.model')}: ${displayModelName.value}`
})

const displayModelName = computed(() =>
  extractorModels.value.find(model => `${model.connectionId}:${model.modelId}` === selectedModel.value)?.displayName
  ?? selectedModel.value
)

function startFromConfig() {
  if (!canStart.value) return
  configOpen.value = false
  void start()
}

function deleteTreeItem(item: { name: string, path: string }, area: PdfFileArea) {
  pendingDelete.value = { name: item.name, path: item.path, area }
  deleteOpen.value = true
}

const deleteDescription = computed(() => {
  const item = pendingDelete.value
  if (!item) return ''
  return item.area === 'sources'
    ? t('pdf.library.deleteDesc', { name: item.name })
    : t('pdf.library.deletePlain', { name: item.name })
})

async function confirmDelete() {
  const item = pendingDelete.value
  deleteOpen.value = false
  pendingDelete.value = null
  if (!item) return
  await explorer.removeItem(item.path, item.area)
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
        :loading="busy === 'extract' || explorer.loading.value"
        @click="reloadAll"
      />
    </template>

    <PdfContextMenu :items="pageMenu">
      <PdfWorkspaceShell
        :tree="explorer.tree.value"
        :current-folder="explorer.currentFolder.value"
        :area="explorer.activeArea.value"
        :selected-key="explorer.selectedKey.value"
        :can-create="explorer.foldersWritable.value"
        :loading="explorer.loading.value"
        lazy
        @select="explorer.select"
        @expand="explorer.expand"
        @search="explorer.searchFolders"
        @create="explorer.openCreateFolder"
        @rename="item => explorer.openRename({ name: item.name, relativePath: item.path }, true, item.area ?? explorer.activeArea.value)"
        @delete="item => deleteTreeItem({ name: item.name, path: item.path }, item.area ?? explorer.activeArea.value)"
      >
        <PdfFileBrowser
          :area="explorer.activeArea.value"
          :title="t(`pdf.areas.${explorer.activeArea.value}`)"
          :description="explorer.areaDescription.value"
          :current-folder="explorer.currentFolder.value"
          :folders="explorer.folders.value"
          :files="explorer.files.value"
          :breadcrumbs="explorer.breadcrumbs.value"
          :parent-folder="explorer.parentFolder.value"
          :loading="explorer.loading.value"
          :uploading="busy === 'upload'"
          :upload-accept="PDF_UPLOAD_ACCEPT"
          :upload-label="t('pdf.library.dropzone')"
          :upload-description="t('pdf.library.dropzoneDesc', { maxMb: library?.maxUploadMb ?? 0 })"
          :selected-path="selectedSource"
          :pickable="sourcePicker"
          :readonly="explorer.activeArea.value !== 'sources'"
          :folders-writable="explorer.foldersWritable.value"
          :deletable="explorer.fileDeletable.value"
          list-class="max-h-[40vh]"
          @pick="pickSource"
          @upload="handleUpload"
          @refresh="reloadAll"
          @select-folder="explorer.select"
          @open-folder="folder => explorer.select(folder.relativePath || folder.name)"
          @rename-folder="folder => explorer.openRename(folder, true)"
          @delete-folder="folder => deleteTreeItem({ name: folder.name, path: folder.relativePath || folder.name }, explorer.activeArea.value)"
          @rename-file="file => explorer.openRename(file, false)"
          @delete-file="file => deleteTreeItem({ name: file.name, path: file.relativePath || file.name }, explorer.activeArea.value)"
        >
          <template v-if="sourcePicker" #flow-note>
            <PdfDocumentDataFlowNote
              :operation="t(extractOperation.titleKey)"
              :input="flowInput"
              :output="{
                areaLabel: outputArea ? t(`pdf.areas.${outputArea}`) : '—',
                openable: Boolean(outputArea)
              }"
              :state="selection.isValid.value ? 'ready' : 'empty'"
              @open-output="openOutput"
            />
          </template>
        </PdfFileBrowser>

        <PdfOperationResult
          v-if="lastRunSource"
          :status="lastRunStatus"
          :summary="t('pdf.extract.resultSummary', { name: lastRunSource, count: lastRunProducts.length })"
          :items="lastRunProducts.map(file => ({ label: file.name.split('.').pop() ?? file.name, ok: true, detail: file.name }))"
          :output-area="outputArea ? t(`pdf.areas.${outputArea}`) : ''"
          :openable="Boolean(outputArea)"
          @open-output="openOutput"
        />

        <section class="panel flex flex-wrap items-center justify-between gap-2 p-3">
          <div class="min-w-0 space-y-0.5">
            <p class="flex items-center gap-2 text-xs text-muted">
              <UIcon v-if="hasRunning" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin" />
              <UIcon v-else name="i-lucide-cpu" class="size-4 shrink-0" />
              <span class="truncate">{{ hasRunning ? t('pdf.extract.running') : modelSummary }}</span>
            </p>
            <p v-if="noModels" class="flex items-start gap-1 text-xs text-(--ui-warning)">
              <UIcon name="i-lucide-plug-zap" class="mt-0.5 size-3.5 shrink-0" />
              {{ t('pdf.errors.aiKeyMissing') }}
            </p>
          </div>

          <UButton
            icon="i-lucide-scan-text"
            :label="t('pdf.extract.start')"
            color="primary"
            variant="soft"
            size="xs"
            :disabled="!canStart"
            :loading="busy === 'extract'"
            @click="configOpen = true"
          />
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
      </PdfWorkspaceShell>

      <UModal v-model:open="configOpen" :title="t('pdf.extract.configTitle')">
        <template #body>
          <div class="space-y-4">
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

            <UFormField :label="t('pdf.export.formats')" :help="t('pdf.extract.formatsHint')">
              <p class="text-xs text-muted">
                {{ EXTRACT_FORMATS.map(format => format.toUpperCase()).join(' · ') }}
              </p>
            </UFormField>

            <UFormField :help="t('pdf.extract.cacheHint')">
              <UCheckbox
                v-model="force"
                :label="t('pdf.extract.force')"
                :disabled="hasRunning"
              />
            </UFormField>

            <UCheckbox
              v-model="overwrite"
              :label="t('pdf.actions.overwrite')"
              :title="t('pdf.actions.overwriteHint')"
              :disabled="hasRunning"
            />
          </div>
        </template>

        <template #footer>
          <div class="flex w-full items-center justify-end gap-2">
            <UButton
              :label="t('pdf.actions.cancel')"
              color="neutral"
              variant="ghost"
              @click="configOpen = false"
            />
            <UButton
              icon="i-lucide-scan-text"
              :label="t('pdf.extract.start')"
              color="primary"
              variant="soft"
              :disabled="!canStart"
              :loading="busy === 'extract'"
              @click="startFromConfig"
            />
          </div>
        </template>
      </UModal>

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
        v-model:open="deleteOpen"
        :title="t('pdf.actions.delete')"
        :description="deleteDescription"
        :loading="busy === 'deleteItem'"
        @confirm="confirmDelete"
      />
    </PdfContextMenu>
  </BasePage>
</template>
