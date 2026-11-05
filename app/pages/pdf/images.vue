<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileInfo } from '#shared/types/pdf'
import { pdfParentPath } from '~/utils/pdfStudio'

const { t } = useI18n()
const {
  library,
  loading,
  busy,
  refresh,
  upload,
  rasterizeSource,
  imagesToPdf,
  removeImagesFolder
} = usePdfStudio()
const { workspaceItems, refreshItem, folderItems } = usePdfMenus()

const dir = usePdfDirectory('sources')

type Pending = { kind: 'source' | 'images', name: string, path: string }
const pending = ref<Pending | null>(null)
const confirmOpen = ref(false)
const activeSource = ref('')
const overwrite = ref(true)

async function reloadAll() {
  await Promise.all([refresh(), dir.loadDirectory(dir.currentFolder.value)])
}

onMounted(() => {
  void reloadAll()
})

const maxUploadMb = computed(() => library.value?.maxUploadMb ?? 0)
const imageFolders = computed(() => library.value?.images ?? [])

const pageMenu = computed<DropdownMenuItem[][]>(() => [
  [refreshItem(reloadAll)],
  workspaceItems('images'),
  folderItems(pdfParentPath(dir.files.value[0]?.path)).slice(0, 2)
].filter(group => group.length > 0))

function sourceMenu(file: PdfFileInfo): DropdownMenuItem[] {
  const name = file.relativePath || file.name
  return [{
    label: t('pdf.workspaces.export.title'),
    icon: 'i-lucide-share-2',
    onSelect: () => void navigateTo(`/pdf/export?source=${encodeURIComponent(name)}`)
  }]
}

function askDeleteImages(name: string) {
  pending.value = { kind: 'images', name, path: name }
  confirmOpen.value = true
}

function askDeleteSource(item: { name: string, path: string }) {
  pending.value = { kind: 'source', name: item.name, path: item.path }
  confirmOpen.value = true
}

const confirmTitle = computed(() => {
  if (!pending.value) return ''
  return pending.value.kind === 'images'
    ? t('pdf.images.removeTitle')
    : t('pdf.library.deleteTitle')
})

async function confirmDelete() {
  const item = pending.value
  confirmOpen.value = false
  pending.value = null
  if (!item) return
  if (item.kind === 'images') await removeImagesFolder(item.name)
  else await dir.handleDelete(item.path)
  await reloadAll()
}

async function handleUpload(files: File[]) {
  await upload(files, dir.currentFolder.value)
  await reloadAll()
}

async function rasterize(file: PdfFileInfo) {
  activeSource.value = file.path
  await rasterizeSource(file.relativePath || file.name, overwrite.value)
  activeSource.value = ''
  await reloadAll()
}
</script>

<template>
  <BasePage id="pdf-images" :title="t('pdf.workspaces.images.title')" :description="t('pdf.workspaces.images.desc')">
    <PdfContextMenu :items="pageMenu">
      <PdfWorkspaceShell
        :tree="dir.tree.value"
        :current-folder="dir.currentFolder.value"
        area="sources"
        :loading="loading || dir.dirLoading.value"
        @select="dir.loadDirectory"
        @create="dir.openCreateFolderModal"
        @rename="item => dir.openRenameModal({ name: item.name, relativePath: item.path }, true)"
        @delete="item => askDeleteSource(item)"
      >
        <PdfFileBrowser
          area="sources"
          :title="t('pdf.images.sources')"
          :description="t('pdf.images.sourcesDesc')"
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
          list-class="max-h-[46vh]"
          :deletable="false"
          :file-menu="sourceMenu"
          @upload="handleUpload"
          @refresh="reloadAll"
          @create-folder="dir.openCreateFolderModal"
          @select-folder="dir.loadDirectory"
          @open-folder="folder => dir.loadDirectory(folder.relativePath || folder.name)"
          @rename-folder="folder => dir.openRenameModal(folder, true)"
          @delete-folder="folder => askDeleteSource({ name: folder.name, path: folder.relativePath || folder.name })"
          @rename-file="file => dir.openRenameModal(file, false)"
        >
          <template #footer>
            <UCheckbox
              v-model="overwrite"
              :label="t('pdf.actions.overwrite')"
              :title="t('pdf.actions.overwriteHint')"
            />
          </template>

          <template #file-actions="{ file }">
            <UButton
              icon="i-lucide-images"
              :label="t('pdf.images.rasterize')"
              color="neutral"
              variant="soft"
              size="xs"
              :loading="activeSource === file.path"
              @click="rasterize(file)"
            />
          </template>
        </PdfFileBrowser>

        <section class="panel shrink-0">
          <header class="flex items-center justify-between gap-3 border-b border-default px-4 py-2.5">
            <div class="min-w-0">
              <h2 class="text-sm font-semibold">
                {{ t('pdf.images.folders') }}
              </h2>
              <p class="truncate text-xs text-muted">
                {{ t('pdf.images.foldersDesc') }}
              </p>
            </div>
            <span class="mono shrink-0 text-xs text-muted">{{ imageFolders.length }}</span>
          </header>

          <div v-if="!imageFolders.length" class="space-y-1 px-4 py-6 text-center">
            <p class="text-sm font-medium">
              {{ t('pdf.images.noFolders') }}
            </p>
            <p class="text-xs text-muted">
              {{ t('pdf.images.noFoldersDesc') }}
            </p>
          </div>

          <div v-else class="max-h-[320px] divide-y divide-default overflow-y-auto scroll-thin">
            <PdfOutputFolderRow
              v-for="folder in imageFolders"
              :key="folder.name"
              icon="i-lucide-images"
              :name="folder.name"
              :path="folder.path"
              :meta="t('pdf.split.pageCount', { count: folder.fileCount })"
              :modified-at="folder.modifiedAt"
              :primary-label="t('pdf.images.buildPdf')"
              primary-icon="i-lucide-file-plus-2"
              :primary-loading="busy === 'imagesToPdf'"
              @primary="imagesToPdf(folder.name, overwrite)"
              @delete="askDeleteImages(folder.name)"
            />
          </div>
        </section>
      </PdfWorkspaceShell>

      <BaseConfirmModal
        v-model:open="confirmOpen"
        :title="confirmTitle"
        :description="t('pdf.images.removeDesc', { name: pending?.name ?? '' })"
        :loading="busy === 'removeFolder' || busy === 'deleteItem'"
        @confirm="confirmDelete"
      />

      <LazyPdfFolderModal
        v-model:open="dir.folderModalOpen.value"
        :parent-folder="dir.folderTargetParent.value"
        @submit="dir.handleCreateFolder"
      />

      <LazyPdfRenameModal
        v-model:open="dir.renameModalOpen.value"
        :current-name="dir.renameTarget.value?.name"
        :is-folder="dir.renameTarget.value?.isFolder"
        @submit="dir.handleRename"
      />
    </PdfContextMenu>
  </BasePage>
</template>
