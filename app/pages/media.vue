<script setup lang="ts">
import { useModuleExport, buildExportChildren } from '~/composables/useModuleExport'
import type { HeaderAction } from '~/components/base/HeaderActions.vue'
import MediaCloudinaryIndex from '~/components/media/cloudinary/Index.vue'

const { t } = useI18n()
const mediaStore = useMediaStore()
const isConfirmClearHistory = ref(false)
const loadingLocal = ref(true)
const { exporting: exportingMedia, exportModule: exportMedia } = useModuleExport()

useHead({
  title: computed(() => t('media.title'))
})

onMounted(() => {
  loadingLocal.value = false
})

const items = computed(() => [
  { label: t('media.local'), slot: 'local', icon: 'i-lucide-computer', value: 'local' },
  { label: t('media.cloudinary'), slot: 'cloudinary', icon: 'i-simple-icons-cloudinary', value: 'cloudinary' }
])
const activeTab = ref<'local' | 'cloudinary'>('local')

const cloudRef = ref<InstanceType<typeof MediaCloudinaryIndex> | null>(null)
const cloudSearch = ref('')
const localSearch = ref('')

const filteredHistory = computed(() => {
  const q = localSearch.value.trim().toLowerCase()
  const list = mediaStore.linkHistory.value
  if (!q) return list
  return list.filter(link => link.toLowerCase().includes(q))
})

watch(activeTab, (v) => {
  if (v !== 'cloudinary') cloudSearch.value = ''
  if (v !== 'local') localSearch.value = ''
})
watch(cloudSearch, (v) => {
  cloudRef.value?.setSearch(v)
})

const cloudOpenUpload = () => { cloudRef.value?.openUpload() }
const cloudReload = () => { cloudRef.value?.reload() }
const cloudToggleSidebar = () => { cloudRef.value?.toggleSidebar() }
const cloudStats = computed(() =>
  activeTab.value === 'cloudinary' ? cloudRef.value?.getStats() ?? null : null
)
const cloudFolderLabel = computed(() => {
  const folder = cloudStats.value?.folder
  return !folder || folder === 'root' ? t('media.root') : folder
})

const toFile = (link: string): Cloudinary.IFileAttach => ({
  public_id: link,
  url: link,
  thumbnail_url: link,
  format: 'url',
  created_at: new Date().toISOString(),
  display_name: link.split('/').pop() || link
})

function reloadLocal() {
  loadingLocal.value = true
  setTimeout(() => {
    loadingLocal.value = false
  }, 300)
}

const mobileBar = useMobileBar()
const exportHeaderActions = computed<HeaderAction[]>(() => [
  {
    key: 'export',
    icon: 'i-lucide-file-down',
    label: t('admin.export.action'),
    overflow: true,
    disabled: exportingMedia.value,
    children: buildExportChildren(t, fmt => exportMedia('media', fmt))
  }
])
mobileBar.registerActions(computed(() => activeTab.value === 'cloudinary'
  ? [
    { icon: 'i-lucide-upload', label: t('media.upload_text'), color: 'primary' as const, onSelect: cloudOpenUpload },
    { icon: 'i-lucide-folder-tree', label: t('media.folder_text'), onSelect: cloudToggleSidebar },
    ...headerActionsToMobile(exportHeaderActions.value),
    { icon: 'i-lucide-refresh-cw', label: t('common.refresh'), onSelect: cloudReload }
  ]
  : [
    { icon: 'i-lucide-refresh-cw', label: t('common.refresh'), onSelect: reloadLocal },
    ...headerActionsToMobile(exportHeaderActions.value),
    {
      icon: 'i-lucide-trash-2',
      label: t('common.clear'),
      color: 'error' as const,
      onSelect: () => {
        isConfirmClearHistory.value = true
      }
    }
  ]
))
mobileBar.registerInfo(computed(() => activeTab.value === 'cloudinary'
  ? {
    count: cloudStats.value?.count ?? 0,
    loading: cloudStats.value?.loading ?? false,
    text: cloudFolderLabel.value
  }
  : { count: filteredHistory.value.length, loading: loadingLocal.value }
))
</script>

<template>
  <BasePage id="media" :title="t('media.title')" :description="t('media.desc')" flush>
    <template #right>
      <template v-if="activeTab === 'local'">
        <UButton icon="i-lucide-refresh-cw" variant="soft" size="sm" :label="t('common.refresh')"
          :loading="loadingLocal" @click="reloadLocal" />
        <UButton icon="i-lucide-trash-2" color="error" variant="soft" size="sm" :label="t('common.clear')"
          @click="isConfirmClearHistory = true" />
        <BaseHeaderActions :actions="exportHeaderActions" />
      </template>
      <template v-else>
        <UButton icon="i-lucide-upload" color="primary" variant="soft" size="sm" :label="t('media.upload_text')"
          :ui="{ label: 'hidden md:block' }" @click="cloudOpenUpload" />
        <BaseHeaderActions :actions="exportHeaderActions" />
        <UButton icon="i-lucide-refresh-cw" variant="soft" size="sm" :label="t('common.refresh')"
          :ui="{ label: 'hidden md:block' }" @click="cloudReload" />
      </template>
    </template>

    <template #toolbar>
      <UDashboardToolbar v-if="activeTab === 'cloudinary'">
        <template #left>
          <div class="flex items-center gap-2 w-full min-w-0 sm:w-auto">
            <UTooltip :text="t('media.folder_text')">
              <UButton color="neutral" variant="ghost" icon="i-lucide-folder-tree" :aria-label="t('media.folder_text')"
                @click="cloudToggleSidebar" />
            </UTooltip>
            <UInput v-model="cloudSearch" icon="i-lucide-search" :placeholder="t('common.search')"
              class="flex-1 min-w-0 sm:flex-none sm:w-56" size="sm" />
          </div>
        </template>
      </UDashboardToolbar>
      <UDashboardToolbar v-else>
        <template #left>
          <UInput v-model="localSearch" icon="i-lucide-search" :placeholder="t('common.search')"
            class="flex-1 min-w-0 sm:flex-none sm:w-56" size="sm" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #footer>
      <SharedListFooter v-if="activeTab === 'local'" :count="filteredHistory.length" :loading="loadingLocal" />
      <SharedListFooter v-else :count="cloudStats?.count ?? 0" :loading="cloudStats?.loading ?? false">
        <template #left>
          <span class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <UIcon name="i-lucide-folder" class="size-3.5 shrink-0" />
            <span class="truncate font-mono">{{ cloudFolderLabel }}</span>
          </span>
        </template>
      </SharedListFooter>
    </template>

    <div class="relative flex h-full min-h-0 w-full flex-col">
      <UTabs v-model="activeTab" :items="items" class="flex min-h-0 flex-1 flex-col"
        :ui="{ list: 'shrink-0 rounded-none', content: 'flex min-h-0 flex-1 flex-col' }">
        <template #local>
          <div class="relative flex h-full min-h-0 w-full flex-col">
            <div class="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-6">
              <div v-if="loadingLocal" class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
                <USkeleton v-for="i in 16" :key="i" class="aspect-square w-full rounded-lg" />
              </div>

              <div v-else-if="mediaStore.linkHistory.value.length === 0"
                class="flex h-full items-center justify-center border-2 border-dashed border-default bg-elevated/50 rounded-lg">
                <div class="text-center">
                  <UIcon name="i-lucide-computer" class="mx-auto mb-4 h-12 w-12 text-dimmed" />
                  <h3 class="mb-2 font-medium text-highlighted">
                    {{ t('media.local_storage') }}
                  </h3>
                  <p class="text-muted">
                    {{ t('media.no_history') }}
                  </p>
                </div>
              </div>

              <div v-else-if="filteredHistory.length === 0"
                class="flex h-full items-center justify-center border-2 border-dashed border-default bg-elevated/50 rounded-lg">
                <div class="text-center">
                  <UIcon name="i-lucide-search-x" class="mx-auto mb-4 h-12 w-12 text-dimmed" />
                  <p class="text-muted">
                    {{ t('common.no_results') }}
                  </p>
                </div>
              </div>

              <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
                <LazyMediaImageCard v-for="link in filteredHistory" :key="link" :file="toFile(link)"
                  @delete="mediaStore.removeHistory(link)" />
              </div>
            </div>
          </div>
        </template>

        <template #cloudinary>
          <div class="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <MediaCloudinaryIndex ref="cloudRef" mode="page" class="min-h-0 flex-1" :header-text="t('media.title')"
              :search-text="t('common.search')" :upload-text="t('media.upload_text')" :select-text="t('common.select')"
              :selected-text="t('media.selected_files_text')" :loading-folders-error="t('media.loading_folders_error')"
              :loading-files-error="t('media.loading_files_error')"
              :folder-created-title="t('media.folder_created_title')"
              :folder-created-text="t('media.folder_created_text')"
              :folder-create-error="t('media.folder_create_error')" :file-deleted-title="t('media.file_deleted_title')"
              :folder-deleted-title="t('media.folder_deleted_title')" :delete-error="t('media.delete_error')"
              :file-renamed-title="t('media.file_renamed_title')" :rename-error="t('media.rename_error')"
              :delete-title="t('common.delete')" :delete-message="t('common.confirm_delete')"
              :confirm-text="t('common.delete')" :cancel-text="t('common.cancel')"
              :rename-title="t('media.rename_modal_title')" :rename-text="t('media.rename_input_placeholder')" />
          </div>
        </template>
      </UTabs>

      <BaseConfirmModal v-model:open="isConfirmClearHistory" :title="t('confirm.delete_title')"
        :description="t('media.clear_history_desc')" :confirm-label="t('common.confirm')"
        :cancel-label="t('common.cancel')" color="error" icon="i-lucide-trash-2"
        @confirm="() => { mediaStore.clearHistory(); isConfirmClearHistory = false }" />
    </div>
  </BasePage>
</template>
