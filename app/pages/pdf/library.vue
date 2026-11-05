<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileArea, PdfFileInfo } from '#shared/types/pdf'
import { pdfParentPath } from '~/utils/pdfStudio'
import { pdfDocumentStem } from '~/utils/pdfOperations'

const { t } = useI18n()
const { library, loading, busy, refresh, upload, splitSource } = usePdfStudio()
const { workspaceItems, refreshItem, folderItems } = usePdfMenus()
const explorer = usePdfExplorer(library)

const pendingDelete = ref<{ name: string, path: string, area: PdfFileArea } | null>(null)
const confirmOpen = ref(false)
const activeSource = ref('')
const overwrite = ref(true)
const pendingSplit = ref<{ name: string, path: string } | null>(null)
const splitOpen = ref(false)

async function reloadAll() {
  await Promise.all([refresh(), explorer.reload()])
}

onMounted(() => {
  void reloadAll()
})

const maxUploadMb = computed(() => library.value?.maxUploadMb ?? 0)
const trashCount = computed(() => library.value?.trashCount ?? 0)
const canUpload = computed(() => explorer.activeArea.value === 'sources')

const pageMenu = computed<DropdownMenuItem[][]>(() => [
  [refreshItem(reloadAll)],
  workspaceItems('library'),
  folderItems(pdfParentPath(explorer.files.value[0]?.path)).slice(0, 2)
].filter(group => group.length > 0))

function fileMenu(file: PdfFileInfo): DropdownMenuItem[] {
  return [{
    label: t('pdf.workspaces.export.title'),
    icon: 'i-lucide-share-2',
    onSelect: () => void navigateTo(`/pdf/export?source=${encodeURIComponent(file.relativePath || file.name)}`)
  }]
}

async function handleUpload(files: File[]) {
  if (!canUpload.value) return
  await upload(files, explorer.currentFolder.value)
  await reloadAll()
}

async function splitFile(file: PdfFileInfo) {
  const path = file.relativePath || file.name
  pendingSplit.value = { name: path, path }
  splitOpen.value = true
}

const splitDescription = computed(() => {
  const item = pendingSplit.value
  return item ? t('pdf.library.splitConfirm', { name: item.name, folder: pdfDocumentStem(item.name) }) : ''
})

async function runSplit() {
  const item = pendingSplit.value
  splitOpen.value = false
  if (!item) return
  activeSource.value = item.path
  await splitSource(item.path, overwrite.value)
  activeSource.value = ''
  await reloadAll()
  pendingSplit.value = null
}

function askDelete(item: { name: string, path: string, relativePath?: string }, area = explorer.activeArea.value) {
  pendingDelete.value = { name: item.name, path: item.relativePath || item.path, area }
  confirmOpen.value = true
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
  confirmOpen.value = false
  pendingDelete.value = null
  if (!item) return
  await explorer.removeItem(item.path, item.area ?? explorer.activeArea.value)
  await reloadAll()
}
</script>

<template>
  <BasePage id="pdf-library" :title="t('pdf.workspaces.library.title')" :description="t('pdf.workspaces.library.desc')">
    <PdfContextMenu :items="pageMenu">
      <PdfWorkspaceShell
        :tree="explorer.tree.value"
        :current-folder="explorer.currentFolder.value"
        :area="explorer.activeArea.value"
        :selected-key="explorer.selectedKey.value"
        :can-create="explorer.foldersWritable.value"
        :root-label="t('pdf.library.rootLabel')"
        :loading="loading || explorer.loading.value"
        lazy
        @select="explorer.select"
        @expand="explorer.expand"
        @search="explorer.searchFolders"
        @create="explorer.openCreateFolder"
        @rename="item => explorer.openRename({ name: item.name, relativePath: item.path }, true, item.area ?? explorer.activeArea.value)"
        @delete="item => askDelete({ name: item.name, path: item.path, relativePath: item.path }, item.area ?? explorer.activeArea.value)"
      >
        <PdfFileBrowser
          :area="explorer.activeArea.value"
          fill
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
          :trash-count="explorer.foldersWritable.value ? trashCount : 0"
          :readonly="!canUpload"
          :folders-writable="explorer.foldersWritable.value"
          :deletable="explorer.fileDeletable.value"
          :file-menu="explorer.activeArea.value === 'sources' ? fileMenu : undefined"
          @upload="handleUpload"
          @refresh="reloadAll"
          @create-folder="explorer.openCreateFolder"
          @open-trash="explorer.trashOpen.value = true"
          @select-folder="explorer.select"
          @open-folder="folder => explorer.select(folder.relativePath || folder.name)"
          @rename-folder="folder => explorer.openRename(folder, true)"
          @delete-folder="folder => askDelete({ name: folder.name, path: folder.relativePath || folder.name })"
          @rename-file="file => explorer.openRename(file, false)"
          @delete-file="file => askDelete(file)"
        >
          <template v-if="explorer.activeArea.value === 'sources'" #file-actions="{ file }">
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

      <PdfConfirmAction
        v-model:open="splitOpen"
        v-model:overwrite="overwrite"
        :title="t('pdf.library.split')"
        :description="splitDescription"
        icon="i-lucide-scissors"
        :loading="Boolean(activeSource)"
        @confirm="runSplit"
      />

      <BaseConfirmModal
        v-model:open="confirmOpen"
        :title="t('pdf.library.deleteTitle')"
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

      <LazyPdfTrashModal v-model:open="explorer.trashOpen.value" @restored="reloadAll" />
    </PdfContextMenu>
  </BasePage>
</template>
