<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FfmpegConfig, ToolTask, JoinFolderItem } from '~/types'

const props = withDefaults(defineProps<{
  presets?: FfmpegConfig[]
  disabled?: boolean
  selectedEncoder?: string
  mode?: 'files' | 'root' | 'subfolder'
  usePreset?: boolean
  selectedPresetId?: string
  selectedPresetTitle?: string
  config?: Partial<FfmpegConfig>
}>(), {
  mode: 'files',
  presets: () => [],
  usePreset: false
})

const emit = defineEmits<{
  (e: 'submit', tasks: ToolTask[]): void
  (e: 'update:inputPath', path: string): void
}>()

const { t } = useI18n()
const toast = useToast()
const fs = useFileSystem()
const taskManager = useToolTaskManager('ffmpeg')

type JoinMode = 'files' | 'root' | 'subfolder'

const joinMode = computed<JoinMode>(() => props.mode || 'files')
const selectedFiles = ref<string[]>([])
const rootFolder = ref('')
const outputPath = ref('')
const outputDir = ref('')
const threads = useLocalStorage('tools:video:threads', 3)

const availableExtensions = [
  '.mp4', '.mkv', '.mov', '.avi', '.webm', '.ts', '.flv',
  '.jpg', '.jpeg', '.png', '.webp', '.bmp'
]
const selectedExtensions = ref<string[]>(['.mp4', '.mkv', '.mov'])

function setExtType(type: 'video' | 'image' | 'mixed') {
  if (type === 'video') {
    selectedExtensions.value = ['.mp4', '.mkv', '.mov']
  } else if (type === 'image') {
    selectedExtensions.value = ['.jpg', '.jpeg', '.png', '.webp']
  } else {
    selectedExtensions.value = ['.mp4', '.mkv', '.mov', '.jpg', '.jpeg', '.png', '.webp']
  }
}

const scannedFolders = ref<JoinFolderItem[]>([])
const scanning = ref(false)

watch(selectedFiles, (files) => {
  if (files && files[0]) {
    emit('update:inputPath', files[0])
  }
}, { deep: true })

watch(scannedFolders, (folders) => {
  const firstFile = folders?.[0]?.files?.[0]
  if (firstFile) {
    emit('update:inputPath', firstFile)
  }
}, { deep: true })

async function onPickFiles() {
  const files = await fs.pickFile({
    title: t('tools.joinAddFiles'),
    multiSelections: true,
    filters: [{ name: 'Videos', extensions: selectedExtensions.value.map(e => e.replace(/^\./, '')) }]
  })
  if (Array.isArray(files) && files.length > 0) {
    const existing = new Set(selectedFiles.value)
    files.forEach((f) => {
      if (!existing.has(f)) selectedFiles.value.push(f)
    })
    if (!outputPath.value && selectedFiles.value[0]) {
      outputPath.value = selectedFiles.value[0].replace(/\.[^.]+$/, '_joined.mp4')
    }
  }
}

function removeFile(index: number) {
  selectedFiles.value.splice(index, 1)
}

function moveFile(index: number, direction: 'up' | 'down') {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= selectedFiles.value.length) return
  const temp = selectedFiles.value[index]
  if (temp !== undefined && selectedFiles.value[target] !== undefined) {
    selectedFiles.value[index] = selectedFiles.value[target]!
    selectedFiles.value[target] = temp
  }
}

function clearFiles() {
  selectedFiles.value = []
}

function onRootFolderSelected(folder: string) {
  if (folder) {
    if (joinMode.value === 'subfolder') {
      outputDir.value = `${folder}/joined_output`.replace(/\\/g, '/')
    } else {
      outputPath.value = `${folder}/output_joined.mp4`.replace(/\\/g, '/')
    }
    scanFolders()
  }
}

watch(rootFolder, (newVal) => {
  if (newVal) {
    if (joinMode.value === 'subfolder') {
      if (!outputDir.value || outputDir.value.endsWith('/joined_output')) {
        outputDir.value = `${newVal}/joined_output`.replace(/\\/g, '/')
      }
    } else {
      if (!outputPath.value || outputPath.value.endsWith('/output_joined.mp4')) {
        outputPath.value = `${newVal}/output_joined.mp4`.replace(/\\/g, '/')
      }
    }
    scanFolders()
  } else {
    scannedFolders.value = []
  }
})

async function scanFolders() {
  if (!rootFolder.value || !taskManager.isElectron.value) {
    scannedFolders.value = []
    return
  }
  scanning.value = true
  try {
    const mode = joinMode.value === 'subfolder' ? 'subfolder' : 'root'
    const result = await window.electronAPI?.tools.ffmpeg.scanJoinFolders?.(
      rootFolder.value,
      mode,
      selectedExtensions.value
    )
    scannedFolders.value = result || []
  } catch (err) {
    console.error('Failed to scan join folders:', err)
  } finally {
    scanning.value = false
  }
}

watch([rootFolder, joinMode, selectedExtensions], () => {
  if (joinMode.value !== 'files') {
    scanFolders()
  }
}, { deep: true })

const canSubmit = computed(() => {
  if (props.disabled) return false
  if (props.usePreset && !props.selectedPresetId) return false
  if (joinMode.value === 'files') {
    return selectedFiles.value.length >= 2 && !!outputPath.value
  }
  if (joinMode.value === 'root') {
    return scannedFolders.value.length > 0 && !!outputPath.value
  }
  if (joinMode.value === 'subfolder') {
    return scannedFolders.value.length > 0 && !!outputDir.value
  }
  return false
})

function buildTasks(): ToolTask[] {
  const now = new Date().toISOString()
  const chosenConfig = props.usePreset && props.selectedPresetId
    ? props.presets?.find(p => p.id === props.selectedPresetId) || props.config
    : undefined

  const op = props.usePreset ? 'join_render' : 'join'

  if (joinMode.value === 'files') {
    return [{
      args: [],
      options: { encoder: props.selectedEncoder },
      meta: {
        taskId: `ff-join-files-${Date.now()}`,
        input: selectedFiles.value[0] || '',
        joinFiles: [...selectedFiles.value],
        output: outputPath.value,
        operation: op,
        configId: chosenConfig?.id,
        configTitle: chosenConfig?.title,
        threads: 1,
        startedAt: now
      }
    }]
  }

  if (joinMode.value === 'root') {
    const files = scannedFolders.value[0]?.files || []
    return [{
      args: [],
      options: { encoder: props.selectedEncoder },
      meta: {
        taskId: `ff-join-root-${Date.now()}`,
        input: files[0] || rootFolder.value,
        joinFiles: files,
        output: outputPath.value,
        operation: op,
        configId: chosenConfig?.id,
        configTitle: chosenConfig?.title,
        threads: 1,
        startedAt: now
      }
    }]
  }

  // Subfolder mode
  return scannedFolders.value.map((folder: JoinFolderItem, i: number) => {
    const outPath = `${outputDir.value}/${folder.name}_joined.mp4`.replace(/\\/g, '/')
    return {
      args: [],
      options: { encoder: props.selectedEncoder },
      meta: {
        taskId: `ff-join-subfolder-${Date.now()}-${i}`,
        input: folder.files[0] || folder.path,
        joinFiles: folder.files,
        output: outPath,
        operation: op,
        configId: chosenConfig?.id,
        configTitle: chosenConfig?.title,
        threads: threads.value,
        startedAt: now
      }
    }
  })
}

function onSubmit() {
  if (props.usePreset && !props.selectedPresetId) {
    toast.add({ title: t('tools.pleaseSelectConfig'), color: 'error' })
    return
  }
  const tasks = buildTasks()
  if (tasks.length === 0) {
    toast.add({ title: t('tools.noTasksToRun'), color: 'error' })
    return
  }
  emit('submit', tasks)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Mode 1: Files List -->
    <div v-if="joinMode === 'files'" class="space-y-4">
      <div class="flex items-center justify-between">
        <label class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {{ t('tools.joinModeFiles') }} ({{ selectedFiles.length }})
        </label>
        <div class="flex items-center gap-2">
          <UButton icon="i-lucide-plus" size="sm" color="primary" variant="soft" :disabled="disabled"
            @click="onPickFiles">
            {{ t('tools.joinAddFiles') }}
          </UButton>
          <UButton v-if="selectedFiles.length > 0" icon="i-lucide-trash" size="sm" color="neutral" variant="ghost"
            :disabled="disabled" @click="clearFiles">
            {{ t('tools.clearAll') }}
          </UButton>
        </div>
      </div>

      <!-- File list preview -->
      <div v-if="selectedFiles.length > 0"
        class="max-h-60 overflow-y-auto space-y-1.5 p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
        <div v-for="(f, idx) in selectedFiles" :key="f"
          class="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800/70 text-xs">
          <div class="flex items-center gap-2 truncate min-w-0">
            <span class="w-5 text-center font-mono text-neutral-400 shrink-0">{{ idx + 1 }}.</span>
            <UIcon name="i-lucide-film" class="w-4 h-4 text-primary-500 shrink-0" />
            <span class="truncate font-mono text-neutral-700 dark:text-neutral-300" :title="f">{{ f }}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <UButton icon="i-lucide-arrow-up" size="xs" color="neutral" variant="ghost"
              :disabled="idx === 0 || disabled" :title="t('tools.moveUp')" @click="moveFile(idx, 'up')" />
            <UButton icon="i-lucide-arrow-down" size="xs" color="neutral" variant="ghost"
              :disabled="idx === selectedFiles.length - 1 || disabled" :title="t('tools.moveDown')"
              @click="moveFile(idx, 'down')" />
            <UButton icon="i-lucide-x" size="xs" color="error" variant="ghost" :disabled="disabled"
              @click="removeFile(idx)" />
          </div>
        </div>
      </div>
      <div v-else class="p-6 text-center border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
        <UIcon name="i-lucide-film" class="w-8 h-8 mx-auto text-neutral-400 mb-2" />
        <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-3">
          {{ t('tools.errorNumberFileJoin') }}
        </p>
        <UButton icon="i-lucide-plus" size="sm" color="primary" variant="subtle" :disabled="disabled"
          @click="onPickFiles">
          {{ t('tools.joinAddFiles') }}
        </UButton>
      </div>
    </div>

    <!-- Mode 2 & 3: Root Folder or Subfolder -->
    <div v-else class="space-y-4">
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {{ t('tools.joinSelectRootFolder') }}
        </label>
        <BaseFilePicker v-model="rootFolder" mode="folder" placeholder="D:/Videos/InputFolder"
          :title="t('tools.joinSelectRootFolder')" :disabled="disabled" @select="onRootFolderSelected" />
      </div>

      <!-- Extensions filter -->
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs font-medium text-neutral-500 dark:text-neutral-400 shrink-0">Extensions:</span>
        <USelectMenu v-model="selectedExtensions" :items="availableExtensions" multiple size="sm" class="w-64"
          :search-input="{ icon: 'i-lucide-search', placeholder: t('global.search') }" />
        <div class="flex items-center gap-1.5">
          <UButton size="xs" color="neutral" variant="soft" @click="setExtType('video')">
            Video
          </UButton>
          <UButton size="xs" color="neutral" variant="soft" @click="setExtType('image')">
            Image
          </UButton>
          <UButton size="xs" color="neutral" variant="soft" @click="setExtType('mixed')">
            Mixed
          </UButton>
          <UButton v-if="rootFolder" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost"
            :loading="scanning" @click="scanFolders" />
        </div>
      </div>

      <!-- Scan results -->
      <div v-if="scanning" class="p-4 text-center text-sm text-neutral-500">
        <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin mx-auto mb-1 text-primary-500" />
        {{ t('common.loading') }}
      </div>
      <div v-else-if="scannedFolders.length > 0" class="space-y-2">
        <div class="text-xs text-neutral-500">
          <span v-if="joinMode === 'subfolder'">
            {{ t('tools.scanFoundFolders', { count: scannedFolders.length }) }}
          </span>
          <span v-else>
            {{ t('tools.scanFoundVideos', { count: scannedFolders[0]?.count || 0 }) }}
          </span>
        </div>
        <div
          class="max-h-56 overflow-y-auto space-y-1.5 p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div v-for="item in scannedFolders" :key="item.path"
            class="p-2.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800/70 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2 truncate">
              <UIcon :name="joinMode === 'subfolder' ? 'i-lucide-folder' : 'i-lucide-film'"
                class="w-4 h-4 text-primary-500 shrink-0" />
              <span class="font-medium text-neutral-700 dark:text-neutral-200 truncate">{{ item.name }}</span>
            </div>
            <UBadge size="xs" color="neutral" variant="subtle">
              {{ item.count }} videos
            </UBadge>
          </div>
        </div>
      </div>
      <div v-else-if="rootFolder"
        class="p-4 text-center text-xs text-neutral-400 border border-neutral-200 dark:border-neutral-800 rounded-xl">
        {{ t('tools.noTasks') }}
      </div>
    </div>

    <!-- Output & Threads -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {{ joinMode === 'subfolder' ? t('tools.joinSelectOutputDir') : t('tools.joinSelectOutput') }}
        </label>
        <BaseFilePicker v-if="joinMode === 'subfolder'" v-model="outputDir" mode="folder"
          placeholder="D:/Videos/JoinedOutput" :title="t('tools.joinSelectOutputDir')" :disabled="disabled" />
        <BaseFilePicker v-else v-model="outputPath" mode="save" placeholder="D:/Videos/output.mp4"
          :title="t('tools.joinSelectOutput')" :disabled="disabled"
          :filters="[{ name: 'MP4 Video', extensions: ['mp4'] }]" />
      </div>

      <div v-if="joinMode === 'subfolder'" class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {{ t('tools.threads') }}
        </label>
        <UInput v-model.number="threads" type="number" :min="1" :max="8" :disabled="disabled" />
      </div>
    </div>

    <!-- Action Button -->
    <div class="pt-2">
      <UButton icon="i-lucide-merge" variant="soft" color="primary" size="lg" block :disabled="!canSubmit"
        @click="onSubmit">
        {{ t('tools.joinVideo') }}
      </UButton>
    </div>
  </div>
</template>
