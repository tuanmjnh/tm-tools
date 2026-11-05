<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileArea, PdfFileInfo } from '#shared/types/pdf'
import { PDF_INPUT_FORMAT_META, pdfParentPath } from '~/utils/pdfStudio'
import { pdfConvertOutputName, pdfOperation } from '~/utils/pdfOperations'

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

const explorer = usePdfExplorer(library)

const pendingDelete = ref<{ name: string, path: string, area: PdfFileArea } | null>(null)
const confirmOpen = ref(false)
const converting = ref<string | null>(null)
const overwrite = ref(true)
const pendingConvert = ref<{ name: string, path: string } | null>(null)
const convertOpen = ref(false)

async function reloadAll() {
  await Promise.all([refresh(), explorer.reload()])
}

onMounted(() => {
  void reloadAll()
})

const trashCount = computed(() => library.value?.trashCount ?? 0)
const supportedFormats = Object.entries(PDF_INPUT_FORMAT_META)

const pageMenu = computed<DropdownMenuItem[][]>(() => [
  [refreshItem(reloadAll)],
  workspaceItems('import'),
  folderItems(pdfParentPath(explorer.files.value[0]?.path)).slice(0, 2)
].filter(group => group.length > 0))

async function handleUpload(files: File[]) {
  await uploadInputs(files, explorer.currentFolder.value)
  await reloadAll()
}

async function convert(file: PdfFileInfo) {
  const path = file.relativePath || file.name
  pendingConvert.value = { name: path, path }
  convertOpen.value = true
}

const convertDescription = computed(() => {
  const item = pendingConvert.value
  return item ? t('pdf.import.confirmConvert', { name: item.name, output: pdfConvertOutputName(item.name) }) : ''
})

async function runConvert() {
  const item = pendingConvert.value
  convertOpen.value = false
  if (!item) return
  converting.value = item.path
  const result = await convertInput(item.path, overwrite.value)
  converting.value = null
  await reloadAll()
  if (result) await openOutput('convertInput')
  pendingConvert.value = null
}

const activeOperation = computed(() =>
  explorer.activeArea.value === 'inputs' ? pdfOperation('convertInput') : null
)

const flowInput = computed(() =>
  t('pdf.flow.browsing', { folder: explorer.currentFolder.value || '/' })
)

const flowOutputArea = computed(() => {
  const operation = activeOperation.value
  return operation ? explorer.outputArea(operation.output.mappingKey) : null
})

async function openOutput(tool: string) {
  const area = explorer.outputArea(tool)
  if (area) await explorer.select('', area)
}

function askDelete(item: { name: string, path: string, relativePath?: string }, area = explorer.activeArea.value) {
  pendingDelete.value = {
    name: item.name,
    path: item.relativePath || item.name,
    area
  }
  confirmOpen.value = true
}

async function confirmDelete() {
  const item = pendingDelete.value
  confirmOpen.value = false
  pendingDelete.value = null
  if (!item) return
  await explorer.removeItem(item.path, item.area ?? explorer.activeArea.value)
  await reloadAll()
}

const deleteDescription = computed(() => {
  const item = pendingDelete.value
  if (!item) return ''
  if (item.area === 'sources') return t('pdf.library.deleteDesc', { name: item.name })
  return t('pdf.import.removeDesc', { name: item.name })
})
</script>

<template>
  <BasePage id="pdf-import" :title="t('pdf.workspaces.import.title')" :description="t('pdf.workspaces.import.desc')">
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
        @delete="item => askDelete({ name: item.name, path: item.path, relativePath: item.path }, item.area ?? explorer.activeArea.value)"
      >
        <PdfFileBrowser
          :area="explorer.activeArea.value"
          :title="t(`pdf.areas.${explorer.activeArea.value}`)"
          :description="t('pdf.import.inputsDesc')"
          :current-folder="explorer.currentFolder.value"
          :folders="explorer.folders.value"
          :files="explorer.files.value"
          :breadcrumbs="explorer.breadcrumbs.value"
          :parent-folder="explorer.parentFolder.value"
          :loading="explorer.loading.value"
          :uploading="busy === 'uploadInput'"
          :upload-accept="PDF_INPUT_ACCEPT"
          :upload-label="t('pdf.import.dropzone')"
          :upload-description="t('pdf.import.dropzoneDesc')"
          :trash-count="explorer.activeArea.value === 'inputs' ? trashCount : 0"
          :readonly="explorer.activeArea.value !== 'inputs'"
          :folders-writable="explorer.foldersWritable.value"
          :deletable="explorer.fileDeletable.value"
          list-class="max-h-[52vh]"
          @upload="handleUpload"
          @refresh="reloadAll"
          @create-folder="explorer.openCreateFolder"
          @open-trash="explorer.trashOpen.value = true"
          @select-folder="explorer.select"
          @open-folder="folder => explorer.select(folder.relativePath || folder.name)"
          @rename-folder="folder => explorer.openRename(folder, true)"
          @delete-folder="folder => askDelete({ name: folder.name, path: folder.relativePath || folder.name }, explorer.activeArea.value)"
          @rename-file="file => explorer.openRename(file, false)"
          @delete-file="file => askDelete(file, explorer.activeArea.value)"
        >
          <template v-if="activeOperation" #flow-note>
            <PdfDocumentDataFlowNote
              :operation="t(activeOperation.titleKey)"
              :input="{ label: flowInput }"
              :output="{
                areaLabel: flowOutputArea ? t(`pdf.areas.${flowOutputArea}`) : '—',
                openable: Boolean(flowOutputArea)
              }"
              :state="flowOutputArea ? 'partial' : 'empty'"
              @open-output="activeOperation && openOutput(activeOperation.output.mappingKey)"
            />
          </template>

          <template v-if="explorer.activeArea.value === 'inputs'" #file-actions="{ file }">
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
      </PdfWorkspaceShell>

      <BaseConfirmModal
        v-model:open="confirmOpen"
        :title="t('pdf.import.removeTitle')"
        :description="deleteDescription"
        :loading="busy === 'deleteItem'"
        @confirm="confirmDelete"
      />

      <PdfConfirmAction
        v-model:open="convertOpen"
        v-model:overwrite="overwrite"
        :title="t('pdf.import.convert')"
        :description="convertDescription"
        icon="i-lucide-file-text"
        :loading="Boolean(converting)"
        @confirm="runConvert"
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
