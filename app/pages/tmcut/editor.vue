<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { TmcutAsset } from '~/types/tmcut'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useTmcutMedia } from '~/composables/useTmcutMedia'
import { useFileSystem } from '~/composables/useFileSystem'
import { formatDurationSec, formatFileSize } from '~/utils/tmcut/media'
import { TMUTCANVAS_PRESETS, TMUTCUT_SOCIAL_PRESETS, findCanvasPreset, findCanvasPresetByDimensions, ratioLabel } from '~/utils/tmcut/canvas'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const {
  currentProject,
  loadProject,
  saveProject,
  saveStatus,
  lastSavedAt,
  pendingRecovery,
  snapshots,
  applyRecovery,
  dismissRecovery,
  refreshProjects,
  loadSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  switchCanvas,
  setCanvasBackground,
  duplicateAsProject
} = useTmcutProject()

const {
  projectAssets,
  missingAssets,
  analyzingCount,
  importing,
  isDesktop,
  loadLibrary,
  importFiles,
  checkMissing,
  relink,
  removeAsset,
  addAssetToTimeline,
  loadWaveform,
  getThumbUrl
} = useTmcutMedia()

const { pickFile } = useFileSystem()
const toast = useToast()

const projectId = computed(() => (route.query.project as string) || 'default')
const showExportModal = ref(false)
const showSnapshotModal = ref(false)
const showCustomCanvasModal = ref(false)
const thumbErrors = ref<Record<string, boolean>>({})
const waveformMap = ref<Record<string, number[]>>({})

const mediaFilters = [
  { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpg', 'mpeg', 'ts', 'wmv', 'flv'] },
  { name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'wma', 'opus'] },
  { name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif'] }
]

const saveLabel = computed(() => {
  if (saveStatus.value === 'saving') return t('tmcut.save.saving')
  if (saveStatus.value === 'saved') return t('tmcut.save.saved')
  if (saveStatus.value === 'error') return t('tmcut.save.error')
  return ''
})

// Direct file preview state
const previewModalOpen = ref(false)
const previewFilePath = ref('')
const previewFileTitle = ref('')

// ===== Media Library =====

async function handleImportMedia() {
  if (!isDesktop.value) {
    toast.add({ title: t('tmcut.media.desktopOnly'), color: 'warning' })
    return
  }
  const picked = await pickFile({
    title: t('tmcut.media.import'),
    filters: mediaFilters,
    multiSelections: true
  })
  const paths = Array.isArray(picked) ? picked : picked ? [picked] : []
  if (paths.length === 0) return
  const added = await importFiles(paths)
  if (added > 0) {
    toast.add({ title: `${t('global.success')}: ${added}`, color: 'success' })
  }
}

async function handleRelink(asset: TmcutAsset) {
  if (!isDesktop.value) return
  const ext = asset.kind === 'video' ? mediaFilters[0]! : asset.kind === 'audio' ? mediaFilters[1]! : mediaFilters[2]!
  const picked = await pickFile({ title: t('tmcut.media.relink'), filters: [ext] })
  if (!picked) return
  const filePath = Array.isArray(picked) ? picked[0] : picked
  if (!filePath) return
  const ok = await relink(asset.id, filePath)
  toast.add({
    title: t(ok ? 'tmcut.media.relinked' : 'tmcut.media.relinkFailed'),
    color: ok ? 'success' : 'warning'
  })
}

function handleRemoveAsset(asset: TmcutAsset) {
  removeAsset(asset.id)
  toast.add({ title: t('tmcut.media.removed'), color: 'neutral' })
}

function handleAddToTimeline(asset: TmcutAsset) {
  if (addAssetToTimeline(asset.id)) {
    toast.add({ title: t('tmcut.media.addedToTimeline'), color: 'success' })
  }
}

function assetKindIcon(asset: TmcutAsset): string {
  return asset.kind === 'video' ? 'i-lucide-film' : asset.kind === 'audio' ? 'i-lucide-music' : 'i-lucide-image'
}

function assetMetaLabel(asset: TmcutAsset): string {
  const parts: string[] = [t(`tmcut.media.${asset.kind}`)]
  if (asset.meta.durationSec > 0) {
    parts.push(formatDurationSec(asset.meta.durationSec))
  }
  if (asset.kind === 'video' && asset.meta.width > 0) {
    parts.push(`${asset.meta.width}x${asset.meta.height}`)
  }
  if (asset.meta.fileSize > 0) {
    parts.push(formatFileSize(asset.meta.fileSize))
  }
  return parts.join(' · ')
}

async function ensureWaveforms() {
  for (const asset of projectAssets.value) {
    if (asset.kind === 'audio' && asset.waveformPath && !waveformMap.value[asset.id]) {
      const points = await loadWaveform(asset)
      if (points.length > 0) {
        waveformMap.value[asset.id] = points
      }
    }
  }
}

watch(projectAssets, () => {
  void ensureWaveforms()
}, { immediate: true })

// ===== Recovery / Snapshots =====

async function handleRestoreRecovery() {
  await applyRecovery()
  if (!pendingRecovery.value) {
    toast.add({ title: t('tmcut.recovery.restored'), color: 'success' })
  }
}

async function handleDismissRecovery() {
  await dismissRecovery()
}

function handleSaveSnapshot() {
  void createSnapshot()
  toast.add({ title: t('tmcut.snapshot.saved'), color: 'success' })
}

async function handleRestoreSnapshot(ts: number) {
  await restoreSnapshot(ts)
  toast.add({ title: t('tmcut.snapshot.restored'), color: 'success' })
  showSnapshotModal.value = false
}

async function handleDeleteSnapshot(ts: number) {
  await deleteSnapshot(ts)
  toast.add({ title: t('tmcut.snapshot.deleted'), color: 'neutral' })
}

onMounted(async () => {
  await loadProject(projectId.value)
  refreshProjects()
  loadLibrary()
  checkMissing()
  loadSnapshots()
})

const canvasPresets = computed(() => TMUTCANVAS_PRESETS.map(preset => ({
  label: t(`tmcut.ratios.${preset.id.replace(':', '_')}`),
  ratio: preset.id,
  width: preset.width,
  height: preset.height,
  icon: preset.icon
})))

const socialPresets = computed(() => TMUTCUT_SOCIAL_PRESETS.map(preset => ({
  label: t(`tmcut.social.${preset.id.replace(/-/g, '_')}`),
  presetId: preset.id,
  icon: preset.icon
})))

const fpsOptions = [
  { label: '24 FPS', value: 24 },
  { label: '30 FPS', value: 30 },
  { label: '60 FPS', value: 60 }
]

const customCanvas = ref({ width: 1080, height: 1080, fps: 30 })

const currentRatioLabel = computed(() => {
  if (!currentProject.value?.canvas) return ''
  const { width, height } = currentProject.value.canvas
  return ratioLabel(width, height)
})

function applyCanvasPreset(preset: { ratio: string, width: number, height: number }) {
  if (!currentProject.value) return
  switchCanvas(preset.width, preset.height)
  toast.add({
    title: t('tmcut.aspectRatioUpdated'),
    description: `${preset.ratio} (${preset.width}x${preset.height})`,
    color: 'success'
  })
}

function applySocialPreset(social: { presetId: string, label: string }) {
  const preset = findCanvasPreset(social.presetId)
  if (!preset || !currentProject.value) return
  switchCanvas(preset.width, preset.height)
  toast.add({
    title: t('tmcut.canvas.socialApplied'),
    description: `${social.label} · ${preset.id} (${preset.width}x${preset.height})`,
    color: 'success'
  })
}

function applyCustomCanvas() {
  const { width, height, fps } = customCanvas.value
  if (!width || !height || width < 64 || height < 64 || width > 7680 || height > 4320) {
    toast.add({ title: t('tmcut.canvas.customInvalid'), color: 'warning' })
    return
  }
  if (!currentProject.value) return
  switchCanvas(Math.round(width), Math.round(height))
  if (currentProject.value) {
    currentProject.value.canvas.fps = fps
    saveProject()
  }
  showCustomCanvasModal.value = false
  toast.add({
    title: t('tmcut.aspectRatioUpdated'),
    description: `${t('tmcut.canvas.custom')} (${width}x${height})`,
    color: 'success'
  })
}

function applyFps(fps: number) {
  if (!currentProject.value) return
  currentProject.value.canvas.fps = fps
  saveProject()
  toast.add({
    title: t('tmcut.fpsUpdated'),
    description: `${fps} FPS`,
    color: 'success'
  })
}

function handleDuplicateAs(presetId: string) {
  const cloned = duplicateAsProject(presetId)
  if (cloned) {
    toast.add({
      title: t('tmcut.reframe.duplicated', { ratio: findCanvasPreset(presetId)?.id || presetId }),
      color: 'success'
    })
  }
}

const canvasMenuItems = computed(() => {
  const currentWidth = currentProject.value?.canvas?.width
  const currentHeight = currentProject.value?.canvas?.height
  const currentFps = currentProject.value?.canvas?.fps

  const presetItems = canvasPresets.value.map(preset => ({
    label: `${preset.ratio} - ${preset.label}`,
    icon: preset.icon,
    checked: currentWidth === preset.width && currentHeight === preset.height,
    onSelect: () => applyCanvasPreset(preset)
  }))

  presetItems.push({
    label: t('tmcut.canvas.custom'),
    icon: 'i-lucide-settings-2',
    checked: !findCanvasPresetByDimensions(currentWidth || 0, currentHeight || 0),
    onSelect: () => {
      customCanvas.value = {
        width: currentWidth || 1080,
        height: currentHeight || 1080,
        fps: currentFps || 30
      }
      showCustomCanvasModal.value = true
    }
  })

  const socialItems = socialPresets.value.map(preset => ({
    label: preset.label,
    icon: preset.icon,
    onSelect: () => applySocialPreset(preset)
  }))

  const backgroundItems = [
    {
      label: t('tmcut.canvas.bgBlack'),
      icon: 'i-lucide-circle',
      onSelect: () => setCanvasBackground('color', '#000000')
    },
    {
      label: t('tmcut.canvas.bgWhite'),
      icon: 'i-lucide-circle',
      onSelect: () => setCanvasBackground('color', '#ffffff')
    },
    {
      label: t('tmcut.canvas.bgDark'),
      icon: 'i-lucide-circle',
      onSelect: () => setCanvasBackground('color', '#1a1a1a')
    },
    {
      label: t('tmcut.canvas.bgLight'),
      icon: 'i-lucide-circle',
      onSelect: () => setCanvasBackground('color', '#e5e5e5')
    },
    {
      label: t('tmcut.canvas.transparent'),
      icon: 'i-lucide-circle-dashed',
      onSelect: () => setCanvasBackground('transparent')
    }
  ]

  const fpsItems = fpsOptions.map(item => ({
    label: `${item.label}`,
    icon: 'i-lucide-gauge',
    checked: currentFps === item.value,
    onSelect: () => applyFps(item.value)
  }))

  return [presetItems, socialItems, backgroundItems, fpsItems]
})

function openFilePreview(filePath?: string, title?: string) {
  if (!filePath) return
  previewFilePath.value = filePath
  previewFileTitle.value = title || filePath.split(/[\\/]/).pop() || t('tmcut.previewFile')
  previewModalOpen.value = true
}

function showInFolder(filePath?: string) {
  if (filePath && window.electronAPI?.showItemInFolder) {
    window.electronAPI.showItemInFolder(filePath)
  }
}

const editorExtraActions = computed(() => [
  [
    {
      label: t('tmcut.addVideo'),
      icon: 'i-lucide-plus',
      onSelect: () => handleImportMedia()
    },
    {
      label: t('tmcut.snapshot.save'),
      icon: 'i-lucide-camera',
      onSelect: () => handleSaveSnapshot()
    },
    {
      label: t('tmcut.snapshot.title'),
      icon: 'i-lucide-history',
      onSelect: () => {
        void loadSnapshots()
        showSnapshotModal.value = true
      }
    }
  ],
  [
    {
      label: t('tmcut.reframe.label'),
      icon: 'i-lucide-proportions',
      type: 'label' as const
    },
    ...['16:9', '9:16', '1:1', '4:5'].map(ratioId => ({
      label: t('tmcut.reframe.duplicateAs', { ratio: ratioId }),
      icon: findCanvasPreset(ratioId)?.icon || 'i-lucide-proportions',
      onSelect: () => handleDuplicateAs(ratioId)
    }))
  ],
  [
    {
      label: t('nav.tmcut_templates'),
      icon: 'i-lucide-layout-template',
      onSelect: () => router.push('/tmcut/templates')
    },
    {
      label: t('nav.tmcut_autocut'),
      icon: 'i-lucide-scissors',
      onSelect: () => router.push('/tmcut/autocut')
    }
  ]
])
</script>

<template>
  <BasePage
    id="tmcut-editor"
    :title="currentProject?.name || t('tmcut.editor')"
    :description="currentProject?.canvas ? `${currentProject.canvas.width}x${currentProject.canvas.height} (${currentProject.canvas.fps}fps)` : undefined"
    flush
  >
    <template #leading>
      <div class="flex items-center gap-1">
        <UDashboardSidebarCollapse />
        <UButton
          to="/tmcut"
          icon="i-lucide-arrow-left"
          size="sm"
          variant="soft"
          color="neutral"
          :title="t('tmcut.back')"
        />
      </div>
    </template>

    <template #left>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-clapperboard" class="size-5 text-primary shrink-0" />
        <input
          v-if="currentProject"
          v-model="currentProject.name"
          class="bg-transparent border-none font-semibold text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5 max-w-50 truncate"
          @blur="saveProject"
        >
      </div>
    </template>

    <template #right>
      <!-- Aspect Ratio & Resolution Preset Dropdown -->
      <UDropdownMenu :items="canvasMenuItems" :content="{ side: 'bottom', align: 'end' }">
        <UButton
          v-if="currentProject?.canvas"
          icon="i-lucide-proportions"
          size="sm"
          variant="soft"
          color="neutral"
          :title="t('tmcut.canvasRatio')"
        >
          <span class="font-mono text-xs">{{ currentRatioLabel }} ({{ currentProject.canvas.fps }}fps)</span>
          <UIcon name="i-lucide-chevron-down" class="size-3 text-neutral-400" />
        </UButton>
      </UDropdownMenu>

      <span
        v-if="saveLabel"
        class="hidden lg:inline text-[11px] font-mono text-neutral-400"
        :class="saveStatus === 'error' ? 'text-red-400' : ''"
        :title="lastSavedAt ? new Date(lastSavedAt).toLocaleString() : ''"
      >
        {{ saveLabel }}
      </span>
      <UButton
        icon="i-lucide-save"
        size="sm"
        variant="soft"
        color="neutral"
        @click="saveProject"
      >
        <span class="hidden md:inline">{{ t('tmcut.save') }}</span>
      </UButton>
      <UButton
        icon="i-lucide-download"
        size="sm"
        color="primary"
        variant="solid"
        @click="showExportModal = true"
      >
        <span class="hidden md:inline">{{ t('tmcut.exportVideo') }}</span>
      </UButton>
      <UDropdownMenu :items="editorExtraActions" :content="{ side: 'bottom', align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis-vertical"
          color="neutral"
          variant="soft"
          size="sm"
          :aria-label="t('common.more')"
        />
      </UDropdownMenu>
    </template>

    <!-- Full viewport Workspace (flush p-0) -->
    <div class="flex-1 flex flex-col min-h-0 bg-neutral-950 text-white overflow-hidden select-none">
      <!-- Recovery banner -->
      <div
        v-if="pendingRecovery"
        class="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-xs"
      >
        <span class="truncate">{{ t('tmcut.recovery.banner') }}</span>
        <div class="flex items-center gap-2 shrink-0">
          <UButton
            size="xs"
            variant="solid"
            color="warning"
            @click="handleRestoreRecovery"
          >
            {{ t('tmcut.recovery.restore') }}
          </UButton>
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            @click="handleDismissRecovery"
          >
            {{ t('tmcut.recovery.discard') }}
          </UButton>
        </div>
      </div>

      <!-- Center Workspace -->
      <div class="flex-1 flex overflow-hidden min-h-0">
        <!-- Left Media Library Panel -->
        <aside class="w-64 border-r border-neutral-800 bg-neutral-900/50 flex flex-col shrink-0">
          <div class="p-3 border-b border-neutral-800 flex items-center justify-between">
            <span class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{{
              t('tmcut.media.library')
            }}</span>
            <UButton
              icon="i-lucide-plus"
              size="xs"
              variant="soft"
              color="primary"
              :disabled="importing"
              @click="handleImportMedia"
            >
              {{ t('tmcut.media.import') }}
            </UButton>
          </div>

          <div
            v-if="missingAssets.length > 0"
            class="mx-3 mt-2 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200"
          >
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-alert-triangle" class="size-3.5 shrink-0" />
              <span class="truncate">{{ t('tmcut.media.missingBanner', { count: missingAssets.length }) }}</span>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-3 space-y-2">
            <!-- Media Library items -->
            <div v-if="importing || analyzingCount > 0" class="flex items-center gap-2 px-2 py-3 text-xs text-neutral-400">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
              {{ t('tmcut.media.importing') }}
            </div>

            <div
              v-else-if="projectAssets.length === 0"
              class="border border-dashed border-neutral-800 hover:border-primary/50 cursor-pointer rounded-lg p-4 text-center transition-colors group"
              @click="handleImportMedia"
            >
              <UIcon
                name="i-lucide-upload-cloud"
                class="size-7 mx-auto text-neutral-500 group-hover:text-primary mb-1.5 transition-colors"
              />
              <p class="text-xs text-neutral-400 group-hover:text-neutral-200 font-medium">
                {{ t('tmcut.media.empty') }}
              </p>
              <p class="text-[10px] text-neutral-600 mt-1">
                {{ t('tmcut.media.importHint') }}
              </p>
            </div>

            <div v-else class="space-y-1.5">
              <div
                v-for="asset in projectAssets"
                :key="asset.id"
                class="group/asset flex items-center gap-2 p-1.5 rounded-lg border border-transparent hover:border-neutral-700 transition-colors"
              >
                <div
                  class="relative w-16 h-10 shrink-0 rounded bg-neutral-800 overflow-hidden flex items-center justify-center"
                >
                  <UIcon :name="assetKindIcon(asset)" class="size-4 text-neutral-500" />
                  <img
                    v-if="asset.thumbPath && !thumbErrors[asset.id]"
                    :src="getThumbUrl(asset)"
                    class="absolute inset-0 w-full h-full object-cover"
                    @error="thumbErrors[asset.id] = true"
                  >
                  <TmcutWaveform
                    v-else-if="asset.kind === 'audio' && waveformMap[asset.id]"
                    :points="waveformMap[asset.id] ?? []"
                    :width="64"
                    :height="40"
                  />
                  <div
                    v-if="asset.status === 'analyzing'"
                    class="absolute inset-0 bg-black/50 flex items-center justify-center"
                  >
                    <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-neutral-300" />
                  </div>
                </div>

                <div class="min-w-0 flex-1">
                  <p class="text-[11px] font-medium text-neutral-200 truncate" :title="asset.name">
                    {{ asset.name }}
                  </p>
                  <p
                    class="text-[10px] truncate"
                    :class="asset.status === 'missing' ? 'text-amber-400' : 'text-neutral-500'"
                  >
                    {{ asset.status === 'missing' ? t('tmcut.media.missing') : assetMetaLabel(asset) }}
                  </p>
                </div>

                <div class="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/asset:opacity-100 transition-opacity">
                  <UButton
                    v-if="asset.status !== 'missing'"
                    icon="i-lucide-plus"
                    size="xs"
                    variant="soft"
                    color="primary"
                    :title="t('tmcut.media.addToTimeline')"
                    @click.stop="handleAddToTimeline(asset)"
                  />
                  <UButton
                    v-if="asset.status === 'missing'"
                    icon="i-lucide-folder-search"
                    size="xs"
                    variant="soft"
                    color="warning"
                    :title="t('tmcut.media.relink')"
                    @click.stop="handleRelink(asset)"
                  />
                  <UButton
                    icon="i-lucide-trash"
                    size="xs"
                    variant="soft"
                    color="error"
                    :title="t('tmcut.media.remove')"
                    @click.stop="handleRemoveAsset(asset)"
                  />
                </div>
              </div>
            </div>

            <!-- Video Clips in Project -->
            <div v-if="currentProject?.timeline?.tracks" class="space-y-1.5 pt-2">
              <span class="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">{{
                t('tmcut.media.clips')
              }}</span>
              <div v-for="track in currentProject.timeline.tracks" :key="track.id">
                <div
                  v-for="item in track.items"
                  :key="item.id"
                  class="group/clip flex items-center justify-between gap-1.5 p-2 rounded bg-neutral-900/80 border border-neutral-800/80 text-xs hover:border-neutral-700 transition-colors"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <UIcon
                      :name="track.type === 'video' ? 'i-lucide-film' : track.type === 'text' ? 'i-lucide-type' : 'i-lucide-music'"
                      class="size-3.5 shrink-0"
                      :class="track.type === 'video' ? 'text-blue-400' : track.type === 'text' ? 'text-amber-400' : 'text-emerald-400'"
                    />
                    <span class="truncate font-medium text-neutral-300 text-[11px]" :title="item.name || item.text">
                      {{ item.name || item.text || t('tmcut.project') }}
                    </span>
                  </div>

                  <div class="flex items-center gap-1 shrink-0">
                    <span class="text-[9px] font-mono text-neutral-500 group-hover/clip:hidden">
                      {{ (((item.out - item.in) / (item.speed || 1))).toFixed(1) }}s
                    </span>
                    <div class="hidden group-hover/clip:flex items-center gap-1">
                      <UButton
                        v-if="item.src"
                        icon="i-lucide-eye"
                        size="xs"
                        variant="soft"
                        color="neutral"
                        :title="t('tmcut.previewFile')"
                        @click.stop="openFilePreview(item.src, item.name)"
                      />
                      <UButton
                        v-if="item.src"
                        icon="i-lucide-folder"
                        size="xs"
                        variant="soft"
                        color="neutral"
                        :title="t('tmcut.openInFolder')"
                        @click.stop="showInFolder(item.src)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <!-- Center Player Preview -->
        <main class="flex-1 flex flex-col items-center justify-center p-4 bg-neutral-950 relative overflow-hidden">
          <div class="w-full max-w-2xl">
            <TmcutPreviewPlayer />
          </div>
        </main>

        <!-- Right Inspector Panel -->
        <aside class="w-80 border-l border-neutral-800 bg-neutral-900/50 flex flex-col overflow-y-auto p-4 shrink-0">
          <div class="pb-2 border-b border-neutral-800 mb-3">
            <span class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{{ t('tmcut.inspector')
            }}</span>
          </div>

          <TmcutInspector />
        </aside>
      </div>

      <!-- Bottom Timeline (h-72) -->
      <div class="h-72 border-t border-neutral-800 bg-neutral-900 flex flex-col shrink-0 z-10">
        <TmcutTimeline />
      </div>

      <!-- Export Modal -->
      <TmcutExportModal v-model:open="showExportModal" />

      <!-- Custom Canvas Modal -->
      <UModal v-model:open="showCustomCanvasModal" :title="t('tmcut.canvas.customTitle')">
        <template #body>
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-neutral-500">{{ t('tmcut.canvas.width') }}</label>
                <UInput
                  v-model="customCanvas.width"
                  type="number"
                  :min="64"
                  :max="7680"
                  class="w-full mt-1"
                />
              </div>
              <div>
                <label class="text-xs text-neutral-500">{{ t('tmcut.canvas.height') }}</label>
                <UInput
                  v-model="customCanvas.height"
                  type="number"
                  :min="64"
                  :max="4320"
                  class="w-full mt-1"
                />
              </div>
            </div>
            <div>
              <label class="text-xs text-neutral-500">{{ t('tmcut.canvas.fps') }}</label>
              <USelect
                v-model="customCanvas.fps"
                :items="fpsOptions"
                class="w-full mt-1"
              />
            </div>
            <p class="text-[11px] text-neutral-500">
              {{ t('tmcut.canvas.customDesc') }}
            </p>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="soft" color="neutral" @click="showCustomCanvasModal = false">
              {{ t('global.cancel') }}
            </UButton>
            <UButton color="primary" variant="solid" @click="applyCustomCanvas">
              {{ t('tmcut.canvas.apply') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Snapshot Modal -->
      <UModal v-model:open="showSnapshotModal" :title="t('tmcut.snapshot.title')">
        <template #body>
          <div class="space-y-3">
            <div class="flex justify-end">
              <UButton
                icon="i-lucide-camera"
                size="xs"
                variant="soft"
                color="primary"
                @click="handleSaveSnapshot"
              >
                {{ t('tmcut.snapshot.save') }}
              </UButton>
            </div>

            <div
              v-if="snapshots.length === 0"
              class="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg p-6 text-center"
            >
              <UIcon name="i-lucide-history" class="w-8 h-8 text-neutral-400 mx-auto mb-2" />
              <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {{ t('tmcut.snapshot.empty') }}
              </p>
              <p class="text-xs text-neutral-500 mt-1">
                {{ t('tmcut.snapshot.emptyDesc') }}
              </p>
            </div>

            <div v-else class="space-y-2 max-h-80 overflow-y-auto">
              <div
                v-for="snapshot in snapshots"
                :key="snapshot.ts"
                class="flex items-center justify-between gap-2 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3"
              >
                <div class="min-w-0">
                  <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                    {{ snapshot.name }}
                  </p>
                  <p class="text-xs text-neutral-500">
                    {{ new Date(snapshot.ts).toLocaleString() }}
                  </p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <UButton size="xs" variant="soft" @click="handleRestoreSnapshot(snapshot.ts)">
                    {{ t('tmcut.snapshot.restore') }}
                  </UButton>
                  <UButton
                    size="xs"
                    variant="soft"
                    color="error"
                    icon="i-lucide-trash"
                    @click="handleDeleteSnapshot(snapshot.ts)"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
      </UModal>

      <!-- Direct Media Preview Modal -->
      <ToolsVideoPreviewModal
        v-model:open="previewModalOpen"
        :file-path="previewFilePath"
        :title="previewFileTitle"
      />
    </div>
  </BasePage>
</template>
