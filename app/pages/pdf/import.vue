<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileInfo } from '#shared/types/pdf'
import { PDF_INPUT_FORMAT_META, pdfParentPath } from '~/utils/pdfStudio'

const { t } = useI18n()
const {
  library,
  loading,
  busy,
  refresh,
  uploadInputs,
  convertInput
} = usePdfStudio()
const { workspaceItems, refreshItem, folderItems } = usePdfMenus()

const dir = usePdfDirectory('inputs')

const pendingDelete = ref<{ name: string, path: string } | null>(null)
const confirmOpen = ref(false)
const converting = ref<string | null>(null)
const overwrite = ref(true)

async function reloadAll() {
  await Promise.all([refresh(), dir.loadDirectory(dir.currentFolder.value)])
}

onMounted(() => {
  void reloadAll()
})

const merged = computed(() => library.value?.merged ?? [])
const trashCount = computed(() => library.value?.trashCount ?? 0)
const supportedFormats = Object.entries(PDF_INPUT_FORMAT_META)

const pageMenu = computed<DropdownMenuItem[][]>(() => [
  [refreshItem(reloadAll)],
  workspaceItems('import'),
  folderItems(pdfParentPath(dir.files.value[0]?.path)).slice(0, 2)
].filter(group => group.length > 0))

function convertedMenu(file: PdfFileInfo): DropdownMenuItem[] {
  return [{
    label: t('pdf.library.split'),
    icon: 'i-lucide-scissors',
    onSelect: () => void navigateTo(`/pdf/split?source=${encodeURIComponent(file.relativePath || file.name)}`)
  }]
}

async function handleUpload(files: File[]) {
  await uploadInputs(files, dir.currentFolder.value)
  await reloadAll()
}

async function convert(file: PdfFileInfo) {
  converting.value = file.path
  await convertInput(file.relativePath || file.name, overwrite.value)
  converting.value = null
  await reloadAll()
}

function askDelete(item: { name: string, path: string, relativePath?: string }) {
  pendingDelete.value = {
    name: item.name,
    path: item.relativePath || item.name
  }
  confirmOpen.value = true
}

async function confirmDelete() {
  const item = pendingDelete.value
  confirmOpen.value = false
  pendingDelete.value = null
  if (item) {
    await dir.handleDelete(item.path)
    await reloadAll()
  }
}
</script>

<template>
  <BasePage id="pdf-import" :title="t('pdf.workspaces.import.title')" :description="t('pdf.workspaces.import.desc')">
    <PdfContextMenu :items="pageMenu">
      <PdfWorkspaceShell
        :tree="dir.tree.value"
        :current-folder="dir.currentFolder.value"
        area="inputs"
        :loading="loading || dir.dirLoading.value"
        @select="dir.loadDirectory"
        @create="dir.openCreateFolderModal"
        @rename="item => dir.openRenameModal({ name: item.name, relativePath: item.path }, true)"
        @delete="item => askDelete({ name: item.name, path: item.path, relativePath: item.path })"
      >
        <PdfFileBrowser
          area="inputs"
          :title="t('pdf.import.inputs')"
          :description="t('pdf.import.inputsDesc')"
          :current-folder="dir.currentFolder.value"
          :folders="dir.folders.value"
          :files="dir.files.value"
          :breadcrumbs="dir.breadcrumbs.value"
          :parent-folder="dir.parentFolder.value"
          :loading="dir.dirLoading.value"
          :uploading="busy === 'uploadInput'"
          :upload-accept="PDF_INPUT_ACCEPT"
          :upload-label="t('pdf.import.dropzone')"
          :upload-description="t('pdf.import.dropzoneDesc')"
          :trash-count="trashCount"
          list-class="max-h-[52vh]"
          @upload="handleUpload"
          @refresh="reloadAll"
          @create-folder="dir.openCreateFolderModal"
          @open-trash="dir.trashOpen.value = true"
          @select-folder="dir.loadDirectory"
          @open-folder="folder => dir.loadDirectory(folder.relativePath || folder.name)"
          @rename-folder="folder => dir.openRenameModal(folder, true)"
          @delete-folder="askDelete"
          @rename-file="file => dir.openRenameModal(file, false)"
          @delete-file="askDelete"
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
              icon="i-lucide-file-text"
              :label="t('pdf.import.convert')"
              color="neutral"
              variant="soft"
              size="xs"
              :loading="converting === file.path"
              @click="convert(file)"
            />
          </template>

          <template #empty-extra>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div v-for="[key, meta] in supportedFormats" :key="key" class="panel-flat flex items-start gap-2 p-2">
                <UIcon :name="meta.icon" class="mt-0.5 size-4 shrink-0 text-muted" />
                <span class="min-w-0">
                  <span class="block text-xs font-medium">{{ t(meta.labelKey) }}</span>
                  <span class="block text-[11px] leading-snug text-muted">{{ t(meta.hintKey) }}</span>
                </span>
              </div>
            </div>
          </template>
        </PdfFileBrowser>

        <section class="panel shrink-0">
          <header class="flex items-center justify-between gap-3 border-b border-default px-4 py-2.5">
            <div class="min-w-0">
              <h2 class="text-sm font-semibold">
                {{ t('pdf.import.converted') }}
              </h2>
              <p class="truncate text-xs text-muted">
                {{ t('pdf.import.convertedDesc') }}
              </p>
            </div>
            <span class="mono shrink-0 text-xs text-muted">{{ merged.length }}</span>
          </header>

          <div v-if="!merged.length" class="px-4 py-6 text-center text-xs text-muted">
            {{ t('pdf.import.noConverted') }}
          </div>

          <div v-else class="max-h-[320px] divide-y divide-default overflow-y-auto scroll-thin">
            <PdfFileRow
              v-for="file in merged"
              :key="file.name"
              area="merged"
              :name="file.name"
              :path="file.path"
              :size="file.size"
              :modified-at="file.modifiedAt"
              :deletable="false"
              :menu="convertedMenu(file)"
            />
          </div>
        </section>
      </PdfWorkspaceShell>

      <BaseConfirmModal
        v-model:open="confirmOpen"
        :title="t('pdf.import.removeTitle')"
        :description="t('pdf.import.removeDesc', { name: pendingDelete?.name ?? '' })"
        :loading="busy === 'deleteItem'"
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

      <LazyPdfTrashModal v-model:open="dir.trashOpen.value" @restored="reloadAll" />
    </PdfContextMenu>
  </BasePage>
</template>
