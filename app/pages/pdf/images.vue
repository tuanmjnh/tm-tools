<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileArea, PdfFileInfo, PdfFolderInfo } from '#shared/types/pdf'
import { pdfParentPath } from '~/utils/pdfStudio'
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
  const name = file.relativePath || file.name
  return [{
    label: t('pdf.workspaces.export.title'),
    icon: 'i-lucide-share-2',
    onSelect: () => void navigateTo(`/pdf/export?source=${encodeURIComponent(name)}`)
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
  return item.area === 'sources'
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
    if (ok) await openOutput('rasterize')
  } else {
    building.value = action.name
    const ok = await imagesToPdf(action.path, overwrite.value)
    building.value = ''
    await reloadAll()
    if (ok) await openOutput('imagesToPdf')
  }
  pendingAction.value = null
}

const activeOperation = computed(() => {
  if (explorer.activeArea.value === 'sources') return pdfOperation('rasterize')
  if (explorer.activeArea.value === 'images') return pdfOperation('imagesToPdf')
  return null
})

const flowInput = computed(() => {
  if (activeSource.value) {
    return { label: activeSource.value.split('/').pop() ?? activeSource.value, detail: activeSource.value }
  }
  if (explorer.activeArea.value === 'images') {
    return { label: t('pdf.flow.browsing', { folder: explorer.currentFolder.value || '/' }) }
  }
  return { label: t('pdf.flow.none') }
})

const flowOutputArea = computed(() => {
  const operation = activeOperation.value
  return operation ? explorer.outputArea(operation.output.mappingKey) : null
})

async function openOutput(tool: string) {
  const area = explorer.outputArea(tool)
  if (area) await explorer.select('', area)
}
</script>

<template>
  <BasePage id="pdf-images" :title="t('pdf.workspaces.images.title')" :description="t('pdf.workspaces.images.desc')">
    <PdfContextMenu :items="pageMenu">
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
          :description="t('pdf.images.sourcesDesc')"
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
          :readonly="explorer.activeArea.value !== 'sources'"
          :folders-writable="explorer.foldersWritable.value"
          :deletable="explorer.fileDeletable.value"
          :file-menu="explorer.activeArea.value === 'sources' ? sourceMenu : undefined"
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
                areaLabel: flowOutputArea ? t(`pdf.areas.${flowOutputArea}`) : '—',
                openable: Boolean(flowOutputArea)
              }"
              :state="flowOutputArea ? 'partial' : 'empty'"
              @open-output="activeOperation && openOutput(activeOperation.output.mappingKey)"
            />
          </template>

          <template v-if="explorer.activeArea.value === 'sources'" #file-actions="{ file }">
            <UButton
              icon="i-lucide-images"
              :label="t('pdf.images.rasterize')"
              color="neutral"
              variant="soft"
              size="xs"
              :loading="activeSource === file.path"
              @click="askRasterize(file)"
            />
          </template>

          <template v-if="explorer.activeArea.value === 'images'" #folder-actions="{ folder }">
            <UButton
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
    </PdfContextMenu>
  </BasePage>
</template>
