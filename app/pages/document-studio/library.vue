<script setup lang="ts">
import { documentFileIcon } from '~/utils/documentStudio'
import { formatBytes } from '~/utils/formatBytes'

const { t } = useI18n()
const library = useDocumentLibrary()
const { viewMode } = useAdminGridView('document-library-view-mode')

const search = ref('')
const newFolderModal = ref(false)
const newFolderName = ref('')
const renameModal = ref(false)
const renameTarget = ref<{ path: string, name: string } | null>(null)
const renameName = ref('')
const confirmDeleteModal = ref(false)
const deleteTarget = ref<{ path: string, name: string, isFolder: boolean } | null>(null)

onMounted(() => {
  library.load()
})

const tabs = computed(() => [
  { label: t('document.library.inputTab'), value: 'input', icon: 'i-lucide-arrow-down-to-dot' },
  { label: t('document.library.outputTab'), value: 'output', icon: 'i-lucide-arrow-up-from-dot' }
])

const filteredItems = computed(() => {
  const list = library.items.value
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(item => item.name.toLowerCase().includes(q))
})

function onTabChange(val: string | number) {
  search.value = ''
  library.setRoot(val as 'input' | 'output')
}

function openCreateFolder() {
  newFolderName.value = ''
  newFolderModal.value = true
}

async function handleCreateFolder() {
  if (!newFolderName.value.trim()) return
  await library.createFolder(newFolderName.value.trim())
  newFolderModal.value = false
}

function openRename(item: { relativePath: string, name: string }) {
  renameTarget.value = { path: item.relativePath, name: item.name }
  renameName.value = item.name
  renameModal.value = true
}

async function handleRename() {
  if (!renameTarget.value || !renameName.value.trim()) return
  await library.renameItem(renameTarget.value.path, renameName.value.trim())
  renameModal.value = false
}

function openDelete(item: { relativePath: string, name: string, isFolder: boolean }) {
  deleteTarget.value = { path: item.relativePath, name: item.name, isFolder: item.isFolder }
  confirmDeleteModal.value = true
}

async function handleDelete() {
  if (!deleteTarget.value) return
  await library.deleteItem(deleteTarget.value.path)
  confirmDeleteModal.value = false
}

function fileIcon(name: string, isFolder: boolean): string {
  if (isFolder) return 'i-lucide-folder'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'i-lucide-file-text'
  if (['png', 'jpg', 'jpeg'].includes(ext)) return 'i-lucide-image'
  if (['xlsx', 'csv'].includes(ext)) return 'i-lucide-table-2'
  if (ext === 'docx') return 'i-lucide-file-type-2'
  if (ext === 'json') return 'i-lucide-braces'
  if (ext === 'xml') return 'i-lucide-code-xml'
  return 'i-lucide-file'
}
</script>

<template>
  <BasePage id="document-library" :title="t('document.library.title')" :description="t('document.library.description')">
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-6">
      <!-- Top controls, search & tabs -->
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap items-center gap-3">
          <UTabs :items="tabs" :model-value="library.root.value" size="xs" :ui="{ root: 'gap-0' }"
            @update:model-value="onTabChange" />
          <div class="w-full sm:w-64">
            <UInput v-model="search" icon="i-lucide-search" size="md" class="w-full"
              :placeholder="t('document.library.searchPlaceholder')" />
          </div>
        </div>

        <div class="flex items-center gap-2">
          <AdminViewModeToggle v-model="viewMode" />
          <UButton icon="i-lucide-folder-plus" color="neutral" variant="soft" size="sm"
            :label="t('document.library.createFolder')" @click="openCreateFolder" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" :loading="library.loading.value"
            @click="() => library.load()" />
        </div>
      </div>

      <!-- Breadcrumbs -->
      <nav class="flex items-center gap-1.5 text-xs text-muted">
        <template v-for="(crumb, idx) in library.breadcrumbs.value" :key="crumb.path">
          <button class="hover:text-primary hover:underline"
            :class="{ 'font-semibold text-foreground': idx === library.breadcrumbs.value.length - 1 }"
            @click="library.navigateToFolder(crumb.path)">
            {{ crumb.name }}
          </button>
          <UIcon v-if="idx < library.breadcrumbs.value.length - 1" name="i-lucide-chevron-right"
            class="size-3 text-dimmed" />
        </template>
      </nav>

      <!-- Content listing -->
      <div v-if="library.loading.value && !library.items.value.length"
        class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t('common.loading') }}
      </div>

      <div v-else-if="!filteredItems.length"
        class="panel-flat rounded-lg border border-dashed border-default/70 p-8 text-center text-muted">
        <UIcon name="i-lucide-folder-open" class="mx-auto mb-2 size-8 text-dimmed" />
        <p class="text-sm font-medium">{{ search ? t('document.library.emptySearch') : t('document.library.emptyFolder')
          }}
        </p>
      </div>

      <!-- Grid Mode -->
      <div v-else-if="viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <div v-for="item in filteredItems" :key="item.relativePath"
          class="panel-flat rounded-lg p-3.5 flex flex-col justify-between gap-3 transition-colors hover:border-primary/50 group">
          <div class="flex items-start gap-2.5 cursor-pointer min-w-0"
            @click="item.isFolder ? library.navigateToFolder(item.relativePath) : null">
            <UIcon :name="documentFileIcon(item.name, item.isFolder)" class="size-6 shrink-0 mt-0.5"
              :class="item.isFolder ? 'text-amber-500' : 'text-primary'" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors"
                :title="item.name">
                {{ item.name }}
              </p>
              <p class="text-xs text-muted mt-0.5">
                {{ item.isFolder ? t('document.library.itemCount', { count: item.fileCount || 0 }) :
                  formatBytes(item.size) }}
              </p>
            </div>
          </div>

          <div class="flex items-center justify-end gap-1 border-t border-default/40 pt-2">
            <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" @click="openRename(item)" />
            <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" @click="openDelete(item)" />
          </div>
        </div>
      </div>

      <!-- List Mode -->
      <div v-else class="panel-flat divide-y divide-default/50 rounded-lg">
        <div v-for="item in filteredItems" :key="item.relativePath"
          class="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/10 group">
          <div class="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
            @click="item.isFolder ? library.navigateToFolder(item.relativePath) : null">
            <UIcon :name="documentFileIcon(item.name, item.isFolder)" class="size-5 shrink-0"
              :class="item.isFolder ? 'text-amber-500' : 'text-primary'" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium group-hover:text-primary transition-colors">{{ item.name }}</p>
              <p class="text-xs text-muted">
                {{ item.isFolder ? t('document.library.itemCount', { count: item.fileCount || 0 }) :
                  formatBytes(item.size) }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-1">
            <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" @click="openRename(item)" />
            <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" @click="openDelete(item)" />
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <LazyBaseConfirmModal v-model:open="confirmDeleteModal" :title="t('document.library.deleteTitle')"
      :description="deleteTarget?.isFolder ? t('document.library.deleteFolderDesc', { name: deleteTarget.name }) : t('document.library.deleteFileDesc', { name: deleteTarget?.name })"
      @confirm="handleDelete" />

    <UModal v-model:open="newFolderModal" :title="t('document.library.createFolder')">
      <template #body>
        <div class="space-y-3">
          <UFormField :label="t('document.library.folderName')">
            <UInput v-model="newFolderName" autofocus class="w-full" @keydown.enter="handleCreateFolder" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="newFolderModal = false" />
          <UButton color="primary" variant="soft" :label="t('common.save')" @click="handleCreateFolder" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="renameModal" :title="t('document.library.renameTitle')">
      <template #body>
        <div class="space-y-3">
          <UFormField :label="t('document.library.newName')">
            <UInput v-model="renameName" autofocus class="w-full" @keydown.enter="handleRename" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="renameModal = false" />
          <UButton color="primary" variant="soft" :label="t('common.save')" @click="handleRename" />
        </div>
      </template>
    </UModal>
  </BasePage>
</template>
