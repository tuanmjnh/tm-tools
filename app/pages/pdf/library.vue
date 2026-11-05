<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileArea, PdfFileInfo, PdfFolderTreeNode } from '#shared/types/pdf'
import { pdfParentPath } from '~/utils/pdfStudio'

const { t } = useI18n()
const {
  library,
  loading,
  busy,
  refresh,
  upload,
  splitSource,
  getExplorerTrees,
  getWorkspaceReport
} = usePdfStudio()
const { workspaceItems, refreshItem, folderItems } = usePdfMenus()

const activeArea = ref<PdfFileArea>('sources')
const dir = usePdfDirectory(activeArea)

const EXPLORER_AREAS: PdfFileArea[] = ['sources', 'inputs', 'split', 'images', 'merged', 'products', 'office']
const explorerTrees = ref<Partial<Record<PdfFileArea, PdfFolderTreeNode[]>>>({})

const pendingDelete = ref<{ name: string, path: string, area: PdfFileArea } | null>(null)
const confirmOpen = ref(false)
const activeSource = ref('')
const overwrite = ref(true)

/** Server registry decides what each area allows; the page never re-decides. */
const areaRules = ref<Partial<Record<PdfFileArea, { files: boolean, folders: boolean }>>>({})

function rulesFor(area: PdfFileArea) {
  return areaRules.value[area] ?? { files: area !== 'word', folders: area !== 'word' }
}

const foldersWritable = computed(() => rulesFor(activeArea.value).folders)
const fileDeletable = computed(() => rulesFor(activeArea.value).files)
const canUpload = computed(() => activeArea.value === 'sources')

function canWriteFolders(area?: PdfFileArea) {
  return rulesFor(area ?? activeArea.value).folders
}

const areaCounts = computed<Record<string, number>>(() => ({
  sources: library.value?.sources.length ?? 0,
  inputs: library.value?.inputs.length ?? 0,
  split: library.value?.split.length ?? 0,
  images: library.value?.images.length ?? 0,
  merged: library.value?.merged.length ?? 0,
  products: library.value?.products.length ?? 0,
  office: library.value?.office.length ?? 0
}))

function withArea(nodes: PdfFolderTreeNode[], area: PdfFileArea): PdfFolderTreeNode[] {
  return nodes.map(node => ({
    ...node,
    id: `${area}:${node.id}`,
    area,
    children: node.children ? withArea(node.children, area) : undefined
  }))
}

const tree = computed<PdfFolderTreeNode[]>(() => EXPLORER_AREAS.map((area) => {
  const children = withArea(explorerTrees.value[area] ?? [], area)
  return {
    id: `${area}:`,
    label: t(`pdf.areas.${area}`),
    path: '',
    relativePath: '',
    fileCount: areaCounts.value[area] ?? 0,
    area,
    system: true,
    readonly: !rulesFor(area).folders,
    children: children.length ? children : undefined
  }
}))

const selectedKey = computed(() => `${activeArea.value}:${dir.currentFolder.value}`)

const areaDescription = computed(() => {
  switch (activeArea.value) {
    case 'inputs': return t('pdf.import.inputsDesc')
    case 'split': return t('pdf.split.foldersDesc')
    case 'images': return t('pdf.images.foldersDesc')
    case 'merged': return t('pdf.split.mergedDesc')
    case 'products': return t('pdf.extract.resultsDesc')
    case 'office': return t('pdf.export.officeDesc')
    default: return t('pdf.library.description')
  }
})

async function loadExplorer() {
  try {
    explorerTrees.value = await getExplorerTrees()
  } catch {
    explorerTrees.value = {}
  }
}

async function loadAreaRules() {
  try {
    const report = await getWorkspaceReport()
    const next: Partial<Record<PdfFileArea, { files: boolean, folders: boolean }>> = {}
    for (const area of EXPLORER_AREAS) {
      const descriptor = report.areas.find(entry => entry.area === area)
      if (descriptor) next[area] = { files: descriptor.writableFiles, folders: descriptor.writableFolders }
    }
    areaRules.value = next
  } catch {
    areaRules.value = {}
  }
}

async function reloadAll() {
  await Promise.all([refresh(), dir.loadDirectory(dir.currentFolder.value), loadExplorer(), loadAreaRules()])
}

onMounted(() => {
  void reloadAll()
})

const maxUploadMb = computed(() => library.value?.maxUploadMb ?? 0)
const trashCount = computed(() => library.value?.trashCount ?? 0)

const pageMenu = computed<DropdownMenuItem[][]>(() => [
  [refreshItem(reloadAll)],
  workspaceItems('library'),
  folderItems(pdfParentPath(dir.files.value[0]?.path)).slice(0, 2)
].filter(group => group.length > 0))

function fileMenu(file: PdfFileInfo): DropdownMenuItem[] {
  const filePath = file.relativePath || file.name
  return [{
    label: t('pdf.workspaces.export.title'),
    icon: 'i-lucide-share-2',
    onSelect: () => void navigateTo(`/pdf/export?source=${encodeURIComponent(filePath)}`)
  }]
}

async function handleSelect(folderPath: string, area?: PdfFileArea) {
  const nextArea = area ?? activeArea.value
  if (nextArea !== activeArea.value) activeArea.value = nextArea
  await dir.loadDirectory(folderPath ?? '')
}

async function handleUpload(files: File[]) {
  if (!canUpload.value) return
  await upload(files, dir.currentFolder.value)
  await reloadAll()
}

async function splitFile(file: PdfFileInfo) {
  activeSource.value = file.path
  await splitSource(file.relativePath || file.name, overwrite.value)
  activeSource.value = ''
  await reloadAll()
}

function askDelete(item: { name: string, path: string, relativePath?: string }, area = activeArea.value) {
  pendingDelete.value = {
    name: item.name,
    path: item.relativePath || item.name,
    area
  }
  confirmOpen.value = true
}

async function handleCreateFolder(name: string) {
  await dir.handleCreateFolder(name)
  await reloadAll()
}

async function handleRename(newName: string) {
  await dir.handleRename(newName)
  await reloadAll()
}

async function confirmDelete() {
  const item = pendingDelete.value
  confirmOpen.value = false
  pendingDelete.value = null
  if (item) {
    await dir.handleDelete(item.path, item.area)
    await reloadAll()
  }
}
</script>

<template>
  <BasePage id="pdf-library" :title="t('pdf.workspaces.library.title')" :description="t('pdf.workspaces.library.desc')">
    <PdfContextMenu :items="pageMenu">
      <PdfWorkspaceShell
        :tree="tree"
        :current-folder="dir.currentFolder.value"
        :area="activeArea"
        :selected-key="selectedKey"
        :can-create="foldersWritable"
        :root-label="t('pdf.library.rootLabel')"
        :loading="loading || dir.dirLoading.value"
        @select="handleSelect"
        @create="(folder, area) => canWriteFolders(area) && dir.openCreateFolderModal(folder, area)"
        @rename="item => canWriteFolders(item.area) && dir.openRenameModal({ name: item.name, relativePath: item.path }, true, item.area)"
        @delete="item => canWriteFolders(item.area) && askDelete({ name: item.name, path: item.path, relativePath: item.path }, item.area)"
      >
        <PdfFileBrowser
          :area="activeArea"
          fill
          :title="t(`pdf.areas.${activeArea}`)"
          :description="areaDescription"
          :current-folder="dir.currentFolder.value"
          :folders="dir.folders.value"
          :files="dir.files.value"
          :breadcrumbs="dir.breadcrumbs.value"
          :parent-folder="dir.parentFolder.value"
          :loading="dir.dirLoading.value"
          :uploading="busy === 'upload'"
          :upload-accept="PDF_UPLOAD_ACCEPT"
          :upload-label="t('pdf.library.dropzone')"
          :upload-description="t('pdf.library.dropzoneDesc', { maxMb: maxUploadMb })"
          :trash-count="foldersWritable ? trashCount : 0"
          :readonly="!canUpload"
          :folders-writable="foldersWritable"
          :deletable="fileDeletable"
          :file-menu="activeArea === 'sources' ? fileMenu : undefined"
          @upload="handleUpload"
          @refresh="reloadAll"
          @create-folder="folder => foldersWritable && dir.openCreateFolderModal(folder)"
          @open-trash="dir.trashOpen.value = true"
          @select-folder="dir.loadDirectory"
          @open-folder="folder => dir.loadDirectory(folder.relativePath || folder.name)"
          @rename-folder="folder => foldersWritable && dir.openRenameModal(folder, true)"
          @delete-folder="folder => foldersWritable && askDelete({ name: folder.name, path: folder.relativePath || folder.name })"
          @rename-file="file => fileDeletable && dir.openRenameModal(file, false)"
          @delete-file="file => fileDeletable && askDelete(file)"
        >
          <template #footer>
            <UCheckbox
              v-model="overwrite"
              :label="t('pdf.actions.overwrite')"
              :title="t('pdf.actions.overwriteHint')"
            />
          </template>

          <template v-if="activeArea === 'sources'" #file-actions="{ file }">
            <UButton
              icon="i-lucide-scissors"
              :label="t('pdf.library.split')"
              color="neutral"
              variant="soft"
              size="xs"
              :loading="activeSource === file.path"
              @click="splitFile(file)"
            />
          </template>
        </PdfFileBrowser>
      </PdfWorkspaceShell>

      <BaseConfirmModal
        v-model:open="confirmOpen"
        :title="t('pdf.library.deleteTitle')"
        :description="t('pdf.library.deleteDesc', { name: pendingDelete?.name ?? '' })"
        :loading="busy === 'deleteItem'"
        @confirm="confirmDelete"
      />

      <LazyPdfFolderModal
        v-model:open="dir.folderModalOpen.value"
        :parent-folder="dir.folderTargetParent.value"
        @submit="handleCreateFolder"
      />

      <LazyPdfRenameModal
        v-model:open="dir.renameModalOpen.value"
        :current-name="dir.renameTarget.value?.name"
        :is-folder="dir.renameTarget.value?.isFolder"
        @submit="handleRename"
      />

      <LazyPdfTrashModal v-model:open="dir.trashOpen.value" @restored="reloadAll" />
    </PdfContextMenu>
  </BasePage>
</template>
