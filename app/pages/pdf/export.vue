<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfExportFormatResult, PdfFileArea, PdfFileInfo, PdfSourceExportFormat } from '#shared/types/pdf'
import { pdfParentPath } from '~/utils/pdfStudio'
import { pdfOperation } from '~/utils/pdfOperations'

const { t } = useI18n()
const route = useRoute()
const {
  library,
  busy,
  refresh,
  upload,
  exportSource,
  errorText
} = usePdfStudio()
const { workspaceItems, refreshItem, folderItems } = usePdfMenus()

const explorer = usePdfExplorer(library)
const selection = usePdfSelection('export')

const formats = ref<PdfSourceExportFormat[]>(['png'])
const overwrite = ref(true)
const results = ref<PdfExportFormatResult[]>([])
const configOpen = ref(false)
const pendingDelete = ref<{ name: string, path: string, area: PdfFileArea } | null>(null)
const deleteOpen = ref(false)

const selectedSource = computed(() => selection.selection.value?.item.relativePath ?? '')

async function reloadAll() {
  await Promise.all([refresh(), explorer.reload()])
}

onMounted(async () => {
  await reloadAll()
  const fromQuery = String(route.query.source ?? '')
  if (fromQuery) {
    selection.pickFile({ area: 'sources', relativePath: fromQuery, name: fromQuery.split('/').pop() ?? fromQuery })
  }
})

function pickSource(file: PdfFileInfo) {
  selection.pickFile({ area: explorer.activeArea.value, relativePath: file.relativePath || file.name, name: file.name })
}

async function handleUpload(files: File[]) {
  await upload(files, explorer.currentFolder.value)
  await reloadAll()
}

const canExport = computed(() => Boolean(selectedSource.value) && formats.value.length > 0 && busy.value === null)

const pageMenu = computed<DropdownMenuItem[][]>(() => [
  [
    refreshItem(reloadAll),
    {
      label: t('pdf.export.run'),
      icon: 'i-lucide-share-2',
      disabled: !canExport.value,
      onSelect: () => void runExport()
    }
  ],
  workspaceItems('export'),
  folderItems(pdfParentPath(explorer.files.value[0]?.path)).slice(0, 2)
].filter(group => group.length > 0))

async function runExport() {
  if (!canExport.value) return
  results.value = (await exportSource(selectedSource.value, formats.value, overwrite.value)) ?? []
  await refresh()
  await explorer.reload()
}

function runFromConfig() {
  if (!canExport.value) return
  configOpen.value = false
  void runExport()
}

const exportOperation = computed(() => pdfOperation('export'))

/** The export route writes three different areas, one per format group. */
const formatArea = (format: PdfSourceExportFormat): PdfFileArea =>
  format === 'png' ? 'images' : format === 'docx' ? 'office' : 'products'

const primaryOutput = computed(() =>
  formats.value.length ? formatArea(formats.value[0]!) : explorer.outputArea('export')
)

const alternateAreas = computed(() => {
  const areas = new Set(formats.value.map(formatArea))
  if (primaryOutput.value) areas.delete(primaryOutput.value)
  return [...areas].map(area => t(`pdf.areas.${area}`))
})

const flowInput = computed(() => {
  const item = selection.selection.value?.item
  return item
    ? { label: item.name, detail: item.relativePath }
    : { label: t('pdf.flow.none') }
})

async function openOutput() {
  if (primaryOutput.value) await explorer.select('', primaryOutput.value)
}

const resultStatus = computed<'success' | 'partial' | 'failed'>(() => {
  if (!results.value.length) return 'failed'
  const failed = results.value.filter(entry => !entry.ok).length
  if (!failed) return 'success'
  return failed === results.value.length ? 'failed' : 'partial'
})

const resultItems = computed(() => results.value.map(entry => ({
  label: entry.format,
  ok: entry.ok,
  detail: entry.ok ? entry.name : errorText(entry.error)
})))

function deleteSource(item: { name?: string, path: string, relativePath?: string }, area: PdfFileArea) {
  const path = item.relativePath || item.path
  pendingDelete.value = { name: item.name || path, path, area }
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
  <BasePage id="pdf-export" :title="t('pdf.workspaces.export.title')" :description="t('pdf.workspaces.export.desc')">
    <template #right>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="xs"
        square
        :aria-label="t('pdf.actions.refresh')"
        :loading="busy === 'exportSource' || explorer.loading.value"
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
        @delete="item => deleteSource({ name: item.name, path: item.path }, item.area ?? explorer.activeArea.value)"
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
          :readonly="explorer.activeArea.value !== 'sources'"
          :pickable="explorer.activeArea.value === 'sources'"
          :folders-writable="explorer.foldersWritable.value"
          :deletable="explorer.fileDeletable.value"
          list-class="max-h-[44vh]"
          @pick="pickSource"
          @upload="handleUpload"
          @refresh="reloadAll"
          @select-folder="explorer.select"
          @open-folder="folder => explorer.select(folder.relativePath || folder.name)"
          @rename-folder="folder => explorer.openRename(folder, true)"
          @delete-folder="folder => deleteSource({ name: folder.name, path: folder.relativePath || folder.name }, explorer.activeArea.value)"
          @rename-file="file => explorer.openRename(file, false)"
          @delete-file="file => deleteSource({ name: file.name, path: file.relativePath || file.name }, explorer.activeArea.value)"
        >
          <template #flow-note>
            <PdfDocumentDataFlowNote
              :operation="t(exportOperation.titleKey)"
              :input="flowInput"
              :output="{
                areaLabel: primaryOutput ? t(`pdf.areas.${primaryOutput}`) : '—',
                alternates: alternateAreas,
                openable: Boolean(primaryOutput)
              }"
              :state="selection.isValid.value ? 'ready' : formats.length ? 'partial' : 'empty'"
              @open-output="openOutput"
            />
          </template>
        </PdfFileBrowser>

        <PdfOperationResult
          v-if="results.length"
          :status="resultStatus"
          :summary="t('pdf.export.resultSummary', { count: results.length })"
          :items="resultItems"
          :output-area="primaryOutput ? t(`pdf.areas.${primaryOutput}`) : ''"
          :openable="Boolean(primaryOutput)"
          @open-output="openOutput"
        />

        <section class="panel flex flex-wrap items-center justify-between gap-2 p-3">
          <p class="min-w-0 space-y-0.5">
            <span class="flex min-w-0 items-center gap-2 text-xs">
              <UIcon name="i-lucide-file-text" class="size-3.5 shrink-0 text-(--ui-primary)" />
              <span class="truncate font-medium">{{ selectedSource || t('pdf.export.sourcePlaceholder') }}</span>
            </span>
            <span class="flex flex-wrap gap-1 pt-1">
              <UBadge
                v-for="format in formats"
                :key="format"
                color="neutral"
                variant="subtle"
                size="xs"
              >
                {{ format.toUpperCase() }}
              </UBadge>
            </span>
          </p>

          <UButton
            icon="i-lucide-file-cog"
            :label="t('pdf.export.run')"
            color="primary"
            variant="soft"
            size="xs"
            :disabled="!selection.isValid.value"
            :loading="busy === 'exportSource'"
            @click="configOpen = true"
          />
        </section>
      </PdfWorkspaceShell>

      <UModal v-model:open="configOpen" :title="t('pdf.export.formats')">
        <template #body>
          <div class="space-y-4">
            <p class="text-xs text-muted">
              {{ t('pdf.export.dataHint') }}
              <NuxtLink to="/pdf/extract" class="text-(--ui-primary) hover:underline">
                {{ t('pdf.workspaces.extract.title') }}
              </NuxtLink>
            </p>

            <PdfExportFormatPicker v-model="formats" :disabled="busy === 'exportSource'" />

            <UCheckbox
              v-model="overwrite"
              :label="t('pdf.actions.overwrite')"
              :title="t('pdf.actions.overwriteHint')"
              :disabled="busy === 'exportSource'"
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
              icon="i-lucide-file-cog"
              :label="t('pdf.export.run')"
              color="primary"
              variant="soft"
              :disabled="!canExport"
              :loading="busy === 'exportSource'"
              @click="runFromConfig"
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

      <LazyPdfFolderModal
        v-model:open="explorer.folderModalOpen.value"
        :parent-folder="explorer.folderTargetParent.value"
        @submit="explorer.handleCreateFolder"
      />

      <LazyPdfRenameModal
        v-model:open="explorer.renameModalOpen.value"
        :current-name="explorer.renameTarget.value?.name"
        :is-folder="explorer.renameTarget.value?.isFolder"
        @submit="explorer.handleRename"
      />
    </PdfContextMenu>
  </BasePage>
</template>
