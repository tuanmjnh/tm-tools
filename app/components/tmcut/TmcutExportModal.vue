<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useToolTaskManager } from '~/composables/useToolTaskManager'
import { compileTimelineToFfmpeg } from '~/utils/tmcut/compiler'
import type { ToolTask } from '~/types'

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { currentProject } = useTmcutProject()
const taskManager = useToolTaskManager('ffmpeg')
const toast = useToast()

const outputPath = ref('')
const selectedEncoder = ref('libx264')
const selectedQuality = ref('medium')
const isExporting = ref(false)
const exportDone = ref(false)
const exportError = ref('')
const previewModalOpen = ref(false)

const encoderOptions = computed(() => [
  { label: t('tmcut.export.encoderCpu'), value: 'libx264' },
  { label: t('tmcut.export.encoderGpu'), value: 'h264_nvenc' }
])

const qualityOptions = computed(() => [
  { label: t('tmcut.export.qualityHigh'), value: 'high', crf: 18 },
  { label: t('tmcut.export.qualityMedium'), value: 'medium', crf: 22 },
  { label: t('tmcut.export.qualityFast'), value: 'fast', crf: 26 }
])

// Current active task from task manager
const activeTask = computed(() => {
  return taskManager.taskList.value[0]
})

const progressPercent = computed(() => {
  return activeTask.value?.progress ?? 0
})

const exportSpeed = computed(() => {
  return activeTask.value?.speed ? `${activeTask.value.speed}` : ''
})

onMounted(() => {
  taskManager.setupListeners()
})

// Initialize default output path when opened
watch(open, (isOpen) => {
  if (isOpen) {
    exportDone.value = false
    exportError.value = ''
    if (!outputPath.value) {
      const sanitizedName = (currentProject.value?.name || 'TMCut_Video').replace(/[/\\:*?"<>|]/g, '_')
      outputPath.value = `D:/${sanitizedName}.mp4`
    }
  }
})

// Watch for task completion
watch(
  () => activeTask.value?.status,
  (status) => {
    if (isExporting.value) {
      if (status === 'done') {
        isExporting.value = false
        exportDone.value = true
        toast.add({ title: t('tmcut.export.success'), color: 'success' })
      } else if (status === 'failed') {
        isExporting.value = false
        exportError.value = activeTask.value?.error || t('tmcut.export.errorDesc')
        toast.add({ title: t('tmcut.export.failed'), description: exportError.value, color: 'error' })
      }
    }
  }
)

async function startExport() {
  if (!currentProject.value) return
  if (!outputPath.value) {
    toast.add({ title: t('tmcut.export.specifyPath'), color: 'error' })
    return
  }

  isExporting.value = true
  exportDone.value = false
  exportError.value = ''

  try {
    const qualityItem = qualityOptions.value.find(q => q.value === selectedQuality.value)
    const compileResult = compileTimelineToFfmpeg(currentProject.value, outputPath.value, {
      encoder: selectedEncoder.value,
      crf: qualityItem?.crf || 22
    })

    const task: ToolTask = {
      args: compileResult.args,
      meta: {
        taskId: `tmcut-${Date.now()}`,
        output: outputPath.value,
        duration: compileResult.duration,
        threads: 1,
        startedAt: new Date().toISOString()
      }
    }

    await taskManager.initManager({
      threads: 1,
      maxRetry: 0,
      timeout: 30 * 60 * 1000
    })

    await taskManager.setTasks([task])
    await taskManager.start()
    await taskManager.refreshStatus()
  } catch (err: unknown) {
    isExporting.value = false
    exportError.value = err instanceof Error ? err.message : String(err)
    toast.add({ title: t('tmcut.export.compilerError'), description: exportError.value, color: 'error' })
  }
}

async function cancelExport() {
  await taskManager.stopAll()
  isExporting.value = false
}

function openResultFile() {
  if (outputPath.value && window.electronAPI?.openPath) {
    window.electronAPI.openPath(outputPath.value)
  }
}

function openResultFolder() {
  if (outputPath.value && window.electronAPI?.showItemInFolder) {
    window.electronAPI.showItemInFolder(outputPath.value)
  }
}

function previewResultDirectly() {
  previewModalOpen.value = true
}
</script>

<template>
  <UModal v-model:open="open" :title="t('tmcut.export.title')" :ui="{ content: 'sm:max-w-lg' }">
    <template #body>
      <div class="space-y-4 text-xs">
        <!-- Canvas Summary Info -->
        <div class="p-3 bg-neutral-900 rounded-lg border border-neutral-800 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-monitor" class="size-4 text-primary" />
            <span class="font-medium text-neutral-200">{{ t('tmcut.export.projectResolution') }}</span>
          </div>
          <span class="font-mono text-neutral-400">
            {{ currentProject?.canvas?.width }} x {{ currentProject?.canvas?.height }} ({{ currentProject?.canvas?.fps }} fps)
          </span>
        </div>

        <!-- Output Destination -->
        <div class="space-y-1">
          <label class="font-medium text-neutral-300">{{ t('tmcut.export.outputFile') }}</label>
          <BaseFilePicker
            v-model="outputPath"
            mode="save"
            placeholder="D:/output.mp4"
            :disabled="isExporting"
            :filters="[{ name: 'MP4 Video', extensions: ['mp4'] }]"
          />
        </div>

        <!-- Encoder & Quality Settings -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="font-medium text-neutral-300">{{ t('tmcut.export.encoder') }}</label>
            <USelect
              v-model="selectedEncoder"
              :items="encoderOptions"
              :disabled="isExporting"
              size="xs"
              class="w-full"
            />
          </div>

          <div class="space-y-1">
            <label class="font-medium text-neutral-300">{{ t('tmcut.export.quality') }}</label>
            <USelect
              v-model="selectedQuality"
              :items="qualityOptions"
              :disabled="isExporting"
              size="xs"
              class="w-full"
            />
          </div>
        </div>

        <!-- Export Progress State -->
        <div v-if="isExporting || exportDone || exportError" class="p-4 bg-neutral-900/80 border border-neutral-800 rounded-lg space-y-3">
          <div class="flex items-center justify-between">
            <span class="font-medium text-neutral-200">
              {{ exportDone ? t('tmcut.export.completed') : exportError ? t('tmcut.export.failed') : t('tmcut.export.exporting') }}
            </span>
            <span v-if="isExporting" class="font-mono text-primary font-semibold">
              {{ progressPercent }}% <span v-if="exportSpeed" class="text-neutral-500 font-normal">({{ exportSpeed }})</span>
            </span>
          </div>

          <!-- Progress Bar -->
          <div class="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-primary transition-all duration-200"
              :style="{ width: `${progressPercent}%` }"
              :class="{ 'bg-emerald-500': exportDone, 'bg-red-500': !!exportError }"
            />
          </div>

          <!-- Finished Actions -->
          <div v-if="exportDone" class="flex flex-wrap items-center gap-2 pt-1">
            <UButton
              icon="i-lucide-play"
              size="xs"
              color="primary"
              variant="solid"
              @click="previewResultDirectly"
            >
              {{ t('tmcut.export.previewNow') }}
            </UButton>
            <UButton
              icon="i-lucide-external-link"
              size="xs"
              variant="soft"
              color="neutral"
              @click="openResultFile"
            >
              {{ t('tmcut.export.openWithApp') }}
            </UButton>
            <UButton
              icon="i-lucide-folder"
              size="xs"
              variant="soft"
              color="neutral"
              @click="openResultFolder"
            >
              {{ t('tmcut.export.openFolder') }}
            </UButton>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
          <UButton
            v-if="!isExporting"
            variant="soft"
            color="neutral"
            size="sm"
            @click="open = false"
          >
            {{ t('tmcut.export.close') }}
          </UButton>
          <UButton
            v-if="isExporting"
            color="error"
            variant="soft"
            size="sm"
            @click="cancelExport"
          >
            {{ t('tmcut.export.cancelExport') }}
          </UButton>
          <UButton
            v-if="!isExporting && !exportDone"
            color="primary"
            variant="solid"
            icon="i-lucide-download"
            size="sm"
            @click="startExport"
          >
            {{ t('tmcut.export.startExport') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <!-- In-App Direct Video Preview Modal -->
  <ToolsVideoPreviewModal
    v-model:open="previewModalOpen"
    :file-path="outputPath"
    :title="currentProject?.name"
  />
</template>
