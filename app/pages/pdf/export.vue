<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfExportFormatResult, PdfFileInfo, PdfSourceExportFormat } from '#shared/types/pdf'
import { pdfParentPath } from '~/utils/pdfStudio'

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

const dir = usePdfDirectory('sources')

const selectedSource = ref('')
const formats = ref<PdfSourceExportFormat[]>(['png'])
const overwrite = ref(true)
const results = ref<PdfExportFormatResult[]>([])

async function reloadAll() {
  await Promise.all([refresh(), dir.loadDirectory(dir.currentFolder.value)])
}

onMounted(async () => {
  await reloadAll()
  const fromQuery = String(route.query.source ?? '')
  if (fromQuery) {
    selectedSource.value = fromQuery
  } else if (dir.files.value[0]) {
    selectedSource.value = dir.files.value[0].relativePath || dir.files.value[0].name
  } else if (library.value?.sources[0]) {
    selectedSource.value = library.value.sources[0].name
  }
})

function pickSource(file: PdfFileInfo) {
  selectedSource.value = file.relativePath || file.name
}

async function handleUpload(files: File[]) {
  await upload(files, dir.currentFolder.value)
  await reloadAll()
}

const canExport = computed(() => Boolean(selectedSource.value) && formats.value.length > 0 && busy.value === null)

const resultIcon = (entry: PdfExportFormatResult) => (entry.ok ? 'i-lucide-check-circle-2' : 'i-lucide-circle-alert')

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
  folderItems(pdfParentPath(dir.files.value[0]?.path)).slice(0, 2)
].filter(group => group.length > 0))

async function runExport() {
  if (!canExport.value) return
  results.value = (await exportSource(selectedSource.value, formats.value, overwrite.value)) ?? []
  await refresh()
}

async function deleteSource(item: { path: string, relativePath?: string }) {
  await dir.handleDelete(item.relativePath || item.path)
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
        :loading="busy === 'exportSource' || dir.dirLoading.value"
        @click="reloadAll"
      />
    </template>

    <PdfContextMenu :items="pageMenu">
      <PdfWorkspaceShell
        :tree="dir.tree.value"
        :current-folder="dir.currentFolder.value"
        area="sources"
        :loading="dir.dirLoading.value"
        @select="dir.loadDirectory"
        @create="dir.openCreateFolderModal"
        @rename="item => dir.openRenameModal({ name: item.name, relativePath: item.path }, true)"
        @delete="deleteSource"
      >
        <PdfFileBrowser
          area="sources"
          selectable
          :title="t('pdf.export.source')"
          :description="t('pdf.export.description')"
          :current-folder="dir.currentFolder.value"
          :folders="dir.folders.value"
          :files="dir.files.value"
          :breadcrumbs="dir.breadcrumbs.value"
          :parent-folder="dir.parentFolder.value"
          :loading="dir.dirLoading.value"
          :uploading="busy === 'upload'"
          upload-accept="application/pdf"
          :upload-label="t('pdf.library.dropzone')"
          :upload-description="t('pdf.library.dropzoneDesc', { maxMb: library?.maxUploadMb ?? 0 })"
          :selected-path="selectedSource"
          list-class="max-h-[44vh]"
          @pick="pickSource"
          @upload="handleUpload"
          @refresh="reloadAll"
          @select-folder="dir.loadDirectory"
          @open-folder="folder => dir.loadDirectory(folder.relativePath || folder.name)"
          @rename-folder="folder => dir.openRenameModal(folder, true)"
          @delete-folder="deleteSource"
          @rename-file="file => dir.openRenameModal(file, false)"
        />

        <section class="panel shrink-0 p-4 space-y-3">
          <header class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0 space-y-0.5">
              <h2 class="text-sm font-semibold">
                {{ t('pdf.export.formats') }}
              </h2>
              <p class="truncate text-xs text-muted">
                {{ t('pdf.export.dataHint') }}
                <NuxtLink to="/pdf/extract" class="text-(--ui-primary) hover:underline">
                  {{ t('pdf.workspaces.extract.title') }}
                </NuxtLink>
              </p>
            </div>

            <span
              class="flex min-w-0 items-center gap-2 rounded-md border border-default bg-muted/10 px-2.5 py-1 text-xs"
            >
              <UIcon name="i-lucide-file-text" class="size-3.5 shrink-0 text-primary-500" />
              <span class="max-w-[220px] truncate">{{ selectedSource || t('pdf.export.sourcePlaceholder') }}</span>
            </span>
          </header>

          <PdfExportFormatPicker v-model="formats" :disabled="busy === 'exportSource'" />

          <div v-if="results.length" class="space-y-1.5 border-t border-default pt-2">
            <p
              v-for="entry in results"
              :key="entry.format"
              class="flex items-center gap-2 text-xs"
              :class="entry.ok ? 'text-(--ui-success)' : 'text-(--ui-error)'"
            >
              <UIcon :name="resultIcon(entry)" class="size-3.5 shrink-0" />
              <span class="mono font-semibold uppercase">{{ entry.format }}</span>
              <span v-if="entry.ok && entry.name" class="truncate text-muted">→ {{ entry.name }}</span>
              <span v-else-if="entry.error" class="truncate">{{ errorText(entry.error) }}</span>
            </p>
          </div>

          <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-default pt-3">
            <UCheckbox
              v-model="overwrite"
              :label="t('pdf.actions.overwrite')"
              :title="t('pdf.actions.overwriteHint')"
              :disabled="busy === 'exportSource'"
            />
            <UButton
              icon="i-lucide-file-cog"
              :label="t('pdf.export.run')"
              color="primary"
              variant="soft"
              size="xs"
              :disabled="!canExport"
              :loading="busy === 'exportSource'"
              @click="runExport"
            />
          </footer>
        </section>
      </PdfWorkspaceShell>

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
