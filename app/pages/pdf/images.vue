<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileArea, PdfFileInfo, PdfFolderInfo } from '#shared/types/pdf'
import { pdfInFolder, pdfIsPdf, pdfParentPath } from '~/utils/pdfStudio'
import { pdfDocumentStem, pdfImagesToPdfOutputName, pdfOperation } from '~/utils/pdfOperations'

const { t } = useI18n()
const {
  library,
  loading,
  busy,
  refresh,
  upload,
  rasterizeSource,
  imagesToPdf
} = usePdfStudio()
const { workspaceItems, refreshItem, folderItems } = usePdfMenus()

const explorer = usePdfExplorer(library)

type Pending = { name: string, path: string, area: PdfFileArea }
const pending = ref<Pending | null>(null)
const confirmOpen = ref(false)
const activeSource = ref('')
const overwrite = ref(true)

type PendingAction = { kind: 'rasterize' | 'build', name: string, path: string }
const pendingAction = ref<PendingAction | null>(null)
const actionOpen = ref(false)

async function reloadAll() {
  await Promise.all([refresh(), explorer.reload()])
}

onMounted(() => {
  void reloadAll()
})

const maxUploadMb = computed(() => library.value?.maxUploadMb ?? 0)

const pageMenu = computed<DropdownMenuItem[][]>(() => [
  [refreshItem(reloadAll)],
  workspaceItems('images'),
  folderItems(pdfParentPath(explorer.files.value[0]?.path)).slice(0, 2)
].filter(group => group.length > 0))

function sourceMenu(file: PdfFileInfo): DropdownMenuItem[] {
  if (!pdfIsPdf(file.name)) return []
  return [{
    label: t('pdf.workspaces.export.title'),
    icon: 'i-lucide-share-2',
    onSelect: () => void navigateTo(`/pdf/export?source=${encodeURIComponent(file.relativePath || file.name)}`)
  }]
}

function askDelete(item: { name: string, path: string }, area: PdfFileArea) {
  pending.value = { name: item.name, path: item.path, area }
  confirmOpen.value = true
}

const confirmTitle = computed(() =>
  pending.value ? t(`pdf.areas.${pending.value.area}`) : ''
)

const confirmDescription = computed(() => {
  const item = pending.value
  if (!item) return ''
  return item.area === 'input'
    ? t('pdf.library.deleteDesc', { name: item.name })
    : t('pdf.images.removeDesc', { name: item.name })
})

async function confirmDelete() {
  const item = pending.value
  confirmOpen.value = false
  pending.value = null
  if (!item) return
  await explorer.removeItem(item.path, item.area ?? explorer.activeArea.value)
  await reloadAll()
}

async function handleUpload(files: File[]) {
  await upload(files, explorer.currentFolder.value)
  await reloadAll()
}

const askTitle = computed(() => {
  const action = pendingAction.value
  if (!action) return ''
  return action.kind === 'rasterize' ? t('pdf.images.rasterize') : t('pdf.images.buildPdf')
})

const askDescription = computed(() => {
  const action = pendingAction.value
  if (!action) return ''
  return action.kind === 'rasterize'
    ? t('pdf.images.confirmRasterize', { name: action.name, folder: pdfDocumentStem(action.name) })
    : t('pdf.images.confirmBuild', { name: action.name, output: pdfImagesToPdfOutputName(action.name) })
})

function askRasterize(file: PdfFileInfo) {
  const path = file.relativePath || file.name
  pendingAction.value = { kind: 'rasterize', name: path, path }
  actionOpen.value = true
}

const building = ref('')

/** Last finished action, so its output can be reviewed and revealed on disk. */
const lastRun = ref<{ kind: 'rasterize' | 'build', name: string, target: string } | null>(null)
const lastRunFiles = ref<PdfFileInfo[]>([])

const lastRunFolder = computed(() => {
  const run = lastRun.value
  if (!run) return ''
  const base = explorer.outputFolder(run.kind === 'build' ? 'imagesToPdf' : 'rasterize') ?? ''
  return run.kind === 'build' ? base : `${base}/${run.target}`
})

const lastRunPath = computed(() => {
  const folder = lastRunFolder.value
  return folder ? explorer.absolutePath('output', folder) : undefined
})

async function recordRun(kind: 'rasterize' | 'build', name: string, target: string, tool: string) {
  lastRun.value = { kind, name, target }
  const folder = explorer.outputFolder(tool)
  if (!folder) {
    lastRunFiles.value = []
    return
  }
  const files = await explorer.listFolder('output', kind === 'build' ? folder : `${folder}/${target}`)
  lastRunFiles.value = kind === 'build' ? files.filter(file => file.name === target) : files
}

function askBuild(folder: PdfFolderInfo) {
  const path = folder.relativePath || folder.name
  pendingAction.value = { kind: 'build', name: folder.name, path }
  actionOpen.value = true
}

async function runAction() {
  const action = pendingAction.value
  actionOpen.value = false
  if (!action) return
  if (action.kind === 'rasterize') {
    activeSource.value = action.path
    const ok = await rasterizeSource(action.path, overwrite.value)
    activeSource.value = ''
    await reloadAll()
    if (ok) {
      await recordRun('rasterize', action.name, pdfDocumentStem(action.name), 'rasterize')
      await openOutput('rasterize')
    }
  } else {
    building.value = action.name
    const ok = await imagesToPdf(action.path, overwrite.value)
    building.value = ''
    await reloadAll()
    if (ok) {
      await recordRun('build', action.name, pdfImagesToPdfOutputName(action.name), 'imagesToPdf')
      await openOutput('imagesToPdf')
    }
  }
  pendingAction.value = null
}

/** Output subfolder that holds the page-image folders. */
const imagesFolder = computed(() => explorer.outputFolder('rasterize') ?? 'images')

/** Rasterize reads `input/`; rebuild consumes folders below `output/images`. */
const activeOperation = computed(() => {
  if (explorer.activeArea.value === 'input') return pdfOperation('rasterize')
  if (explorer.activeArea.value === 'output' && pdfInFolder(explorer.currentFolder.value, imagesFolder.value)) {
    return pdfOperation('imagesToPdf')
  }
  return null
})

const flowInput = computed(() => {
  if (activeSource.value) {
    return { label: activeSource.value.split('/').pop() ?? activeSource.value, detail: activeSource.value }
  }
  if (explorer.activeArea.value === 'output') {
    return { label: t('pdf.flow.browsing', { folder: explorer.currentFolder.value || '/' }) }
  }
  return { label: t('pdf.flow.none') }
})

const flowOutputFolder = computed(() => {
  const operation = activeOperation.value
  return operation ? explorer.outputFolder(operation.output.mappingKey) : null
})

async function openOutput(tool: string) {
  const folder = explorer.outputFolder(tool)
  if (folder) await explorer.select(folder, 'output')
}
</script>

<template>
  <BasePage id="pdf-images" :title="t('pdf.workspaces.images.title')" :description="t('pdf.workspaces.images.desc')">
    <AppContextMenu :items="pageMenu">
      <PdfWorkspaceShell
        :tree="explorer.tree.value"
        :current-folder="explorer.currentFolder.value"
        :area="explorer.activeArea.value"
        :selected-key="explorer.selectedKey.value"
        :can-create="explorer.foldersWritable.value"
        :loading="loading || explorer.loading.value"
        lazy
        @select="explorer.select"
        @expand="explorer.expand"
        @search="explorer.searchFolders"
        @create="explorer.openCreateFolder"
        @rename="item => explorer.openRename({ name: item.name, relativePath: item.path }, true, item.area ?? explorer.activeArea.value)"
        @delete="item => askDelete({ name: item.name, path: item.path }, item.area ?? explorer.activeArea.value)"
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
          :upload-description="t('pdf.library.dropzoneDesc', { maxMb: maxUploadMb })"
          :readonly="explorer.activeArea.value !== 'input'"
          :folders-writable="explorer.foldersWritable.value"
          :deletable="explorer.fileDeletable.value"
          :file-menu="explorer.activeArea.value === 'input' ? sourceMenu : undefined"
          list-class="max-h-[46vh]"
          @upload="handleUpload"
          @refresh="reloadAll"
          @create-folder="explorer.openCreateFolder"
          @select-folder="explorer.select"
          @open-folder="folder => explorer.select(folder.relativePath || folder.name)"
          @rename-folder="folder => explorer.openRename(folder, true)"
          @delete-folder="folder => askDelete({ name: folder.name, path: folder.relativePath || folder.name }, explorer.activeArea.value)"
          @rename-file="file => explorer.openRename(file, false)"
          @delete-file="file => askDelete({ name: file.name, path: file.relativePath || file.name }, explorer.activeArea.value)"
        >
          <template v-if="activeOperation" #flow-note>
            <PdfDocumentDataFlowNote
              :operation="t(activeOperation.titleKey)"
              :input="flowInput"
              :output="{
                areaLabel: flowOutputFolder ? t('pdf.areas.output') : '—',
                relativePath: flowOutputFolder ?? undefined,
                openable: Boolean(flowOutputFolder)
              }"
              :state="flowOutputFolder ? 'partial' : 'empty'"
              @open-output="activeOperation && openOutput(activeOperation.output.mappingKey)"
            />
          </template>

          <template v-if="explorer.activeArea.value === 'input'" #file-actions="{ file }">
            <UButton
              v-if="pdfIsPdf(file.name)"
              icon="i-lucide-images"
              :label="t('pdf.images.rasterize')"
              color="neutral"
              variant="soft"
              size="xs"
              :loading="activeSource === (file.relativePath || file.name)"
              @click="askRasterize(file)"
            />
          </template>

          <template v-if="explorer.activeArea.value === 'output'" #folder-actions="{ folder }">
            <UButton
              v-if="pdfInFolder(folder.relativePath || folder.name, imagesFolder)"
              icon="i-lucide-file-plus-2"
              :label="t('pdf.images.buildPdf')"
              color="primary"
              variant="soft"
              size="xs"
              :loading="building === folder.name"
              @click="askBuild(folder)"
            />
          </template>
        </PdfFileBrowser>

        <PdfOperationResult
          v-if="lastRun"
          :status="lastRunFiles.length ? 'success' : 'failed'"
          :summary="t('pdf.images.resultSummary', { name: lastRun.target })"
          :output-area="t('pdf.areas.output')"
          :output-folder="lastRunFolder"
          :openable="true"
          :files="lastRunFiles"
          area="output"
          :folder-path="lastRunPath"
          @open-output="openOutput(lastRun.kind === 'build' ? 'imagesToPdf' : 'rasterize')"
        />
      </PdfWorkspaceShell>

      <BaseConfirmModal
        v-model:open="confirmOpen"
        :title="confirmTitle"
        :description="confirmDescription"
        :loading="busy === 'deleteItem'"
        @confirm="confirmDelete"
      />

      <PdfConfirmAction
        v-model:open="actionOpen"
        v-model:overwrite="overwrite"
        :title="askTitle"
        :description="askDescription"
        :icon="pendingAction?.kind === 'rasterize' ? 'i-lucide-images' : 'i-lucide-file-plus-2'"
        :loading="Boolean(activeSource) || Boolean(building)"
        @confirm="runAction"
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
    </AppContextMenu>
  </BasePage>
</template>
