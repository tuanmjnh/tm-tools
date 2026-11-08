<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileArea, PdfFileInfo, PdfFolderInfo } from '#shared/types/pdf'
import { pdfInFolder, pdfIsPdf, pdfParentPath } from '~/utils/pdfStudio'
import { pdfDocumentStem, pdfMergeOutputName, pdfOperation } from '~/utils/pdfOperations'

const { t } = useI18n()
const {
  library,
  loading,
  busy,
  refresh,
  upload,
  splitSource,
  mergeFolder
} = usePdfStudio()
const { workspaceItems, refreshItem, folderItems } = usePdfMenus()

const explorer = usePdfExplorer(library)

type Pending = { name: string, path: string, area: PdfFileArea }
const pending = ref<Pending | null>(null)
const confirmOpen = ref(false)
const activeSource = ref('')
const overwrite = ref(true)

type PendingAction = { kind: 'split' | 'merge', name: string, path: string }
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
  workspaceItems('split'),
  folderItems(pdfParentPath(explorer.files.value[0]?.path)).slice(0, 2)
].filter(group => group.length > 0))

function exportItem(name: string): DropdownMenuItem {
  return {
    label: t('pdf.workspaces.export.title'),
    icon: 'i-lucide-share-2',
    onSelect: () => void navigateTo(`/pdf/export?source=${encodeURIComponent(name)}`)
  }
}

function sourceMenu(file: PdfFileInfo): DropdownMenuItem[] {
  if (!pdfIsPdf(file.name)) return []
  return [exportItem(file.relativePath || file.name)]
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
    : t('pdf.split.removeDesc', { name: item.name })
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
  return action.kind === 'split' ? t('pdf.split.splitToPages') : t('pdf.split.mergeToPdf')
})

const askDescription = computed(() => {
  const action = pendingAction.value
  if (!action) return ''
  return action.kind === 'split'
    ? t('pdf.split.confirmSplit', { name: action.name, folder: pdfDocumentStem(action.name) })
    : t('pdf.split.confirmMerge', { name: action.name, output: pdfMergeOutputName(action.name) })
})

function askSplit(file: PdfFileInfo) {
  const path = file.relativePath || file.name
  pendingAction.value = { kind: 'split', name: path, path }
  actionOpen.value = true
}

function askMerge(folder: PdfFolderInfo) {
  const path = folder.relativePath || folder.name
  pendingAction.value = { kind: 'merge', name: folder.name, path }
  actionOpen.value = true
}

const merging = ref('')

/** Last finished action, so its output can be reviewed and revealed on disk. */
const lastRun = ref<{ kind: 'split' | 'merge', name: string, target: string } | null>(null)
const lastRunFiles = ref<PdfFileInfo[]>([])

/** Folder the last run wrote into, relative to `output/`. */
const lastRunFolder = computed(() => {
  const run = lastRun.value
  if (!run) return ''
  const base = explorer.outputFolder(run.kind === 'merge' ? 'merge' : 'split') ?? ''
  return run.kind === 'merge' ? base : `${base}/${run.target}`
})

const lastRunPath = computed(() => {
  const folder = lastRunFolder.value
  return folder ? explorer.absolutePath('output', folder) : undefined
})

async function recordRun(kind: 'split' | 'merge', name: string, target: string, tool: string) {
  lastRun.value = { kind, name, target }
  const folder = explorer.outputFolder(tool)
  if (!folder) {
    lastRunFiles.value = []
    return
  }
  const files = kind === 'merge'
    ? await explorer.listFolder('output', folder)
    : await explorer.listFolder('output', `${folder}/${target}`)
  lastRunFiles.value = kind === 'merge' ? files.filter(file => file.name === target) : files
}

async function runAction() {
  const action = pendingAction.value
  actionOpen.value = false
  if (!action) return
  if (action.kind === 'split') {
    activeSource.value = action.path
    const ok = await splitSource(action.path, overwrite.value)
    activeSource.value = ''
    await reloadAll()
    if (ok) {
      await recordRun('split', action.name, pdfDocumentStem(action.name), 'split')
      await openOutput('split')
    }
  } else {
    merging.value = action.name
    const ok = await mergeFolder(action.path, overwrite.value)
    merging.value = ''
    await reloadAll()
    if (ok) {
      await recordRun('merge', action.name, pdfMergeOutputName(action.name), 'merge')
      await openOutput('merge')
    }
  }
  pendingAction.value = null
}

/** Output subfolder that holds the page folders to merge back. */
const mergeOutputFolder = computed(() => explorer.outputFolder('split') ?? 'split')

/** Split reads `input/`; merge consumes folders created below `output/split`. */
const activeOperation = computed(() => {
  if (explorer.activeArea.value === 'input') return pdfOperation('split')
  if (explorer.activeArea.value === 'output' && pdfInFolder(explorer.currentFolder.value, mergeOutputFolder.value)) {
    return pdfOperation('merge')
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
  <BasePage id="pdf-split" :title="t('pdf.workspaces.split.title')" :description="t('pdf.workspaces.split.desc')">
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
              icon="i-lucide-scissors"
              :label="t('pdf.split.splitToPages')"
              color="neutral"
              variant="soft"
              size="xs"
              :loading="activeSource === (file.relativePath || file.name)"
              @click="askSplit(file)"
            />
          </template>

          <template v-if="explorer.activeArea.value === 'output'" #folder-actions="{ folder }">
            <UButton
              v-if="pdfInFolder(folder.relativePath || folder.name, mergeOutputFolder)"
              icon="i-lucide-layers"
              :label="t('pdf.split.mergeToPdf')"
              color="primary"
              variant="soft"
              size="xs"
              :loading="merging === folder.name"
              @click="askMerge(folder)"
            />
          </template>
        </PdfFileBrowser>

        <PdfOperationResult
          v-if="lastRun"
          :status="lastRunFiles.length ? 'success' : 'failed'"
          :summary="t('pdf.split.resultSummary', { count: lastRunFiles.length, folder: lastRun.target })"
          :output-area="t('pdf.areas.output')"
          :output-folder="lastRunFolder"
          :openable="true"
          :files="lastRunFiles"
          area="output"
          :folder-path="lastRunPath"
          @open-output="openOutput(lastRun.kind === 'merge' ? 'merge' : 'split')"
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
        :icon="pendingAction?.kind === 'split' ? 'i-lucide-scissors' : 'i-lucide-layers'"
        :loading="Boolean(activeSource) || Boolean(merging)"
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
