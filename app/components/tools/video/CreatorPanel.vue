<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ToolTask } from '#shared/types/electron'

const props = withDefaults(defineProps<{
  disabled?: boolean
  selectedEncoder?: string
  loading?: boolean
  mode?: 'root' | 'subfolder'
}>(), {
  mode: 'subfolder'
})

const emit = defineEmits<{
  (e: 'submit', tasks: ToolTask[]): void
}>()

const { t } = useI18n()
const toast = useToast()
const taskManager = useToolTaskManager('ffmpeg')

const creatorMode = computed<'root' | 'subfolder'>(() => props.mode || 'subfolder')

watch(() => props.mode, () => {
  updateSuggestedOutput()
  scanSubfolders()
})

const subfolderInput = ref('')
const subfolderOutput = ref('')
const subfolderThreads = useLocalStorage('tools:video:threads', 3)
const subfoldersList = ref<Array<{ name: string, path: string, count: number, images: string[] }>>([])
const scanningSubfolders = ref(false)
const subfolderResolution = ref('1080x1920')
const subfolderFps = ref(30)
const subfolderMinDuration = ref(2.5)
const subfolderMaxDuration = ref(4.5)
const subfolderTransition = ref('random')
const subfolderTransDuration = ref(0.8)
const subfolderZoom = ref<'random' | 'in' | 'out' | 'none'>('random')
const subfolderBlurBg = ref(true)
const subfolderAudioFile = ref('')
const subfolderShuffle = ref(true)

const subfolderExtensions = ref<string[]>(['.jpg', '.jpeg', '.png', '.webp'])
const availableExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp']

const showTransitionsModal = ref(false)
const subfolderTransitions = ref<string[]>([
  'fade', 'wipeleft', 'wiperight', 'slideleft', 'slideright',
  'circlecrop', 'smoothleft', 'smoothright', 'radial', 'dissolve', 'pixelize', 'zoomin'
])

const resolutionOptions = computed(() => [
  { label: 'Vertical 9:16 (1080x1920 - FHD TikTok/Reels/Shorts)', value: '1080x1920' },
  { label: 'Vertical 9:16 (720x1280 - HD)', value: '720x1280' },
  { label: 'Ngang 16:9 (1920x1080 - FHD YouTube)', value: '1920x1080' },
  { label: 'Ngang 16:9 (1280x720 - HD)', value: '1280x720' },
  { label: 'Ngang 16:9 (2560x1440 - 2K QHD)', value: '2560x1440' },
  { label: 'Square 1:1 (1080x1080 - Instagram)', value: '1080x1080' }
])

const fpsOptions = [
  { label: '24 FPS', value: 24 },
  { label: '30 FPS', value: 30 },
  { label: '60 FPS', value: 60 }
]

const transitionOptions = computed(() => [
  { label: 'Random', value: 'random' },
  { label: 'Fade', value: 'fade' },
  { label: 'Wipe Left', value: 'wipeleft' },
  { label: 'Wipe Right', value: 'wiperight' },
  { label: 'Slide Left', value: 'slideleft' },
  { label: 'Slide Right', value: 'slideright' },
  { label: 'Circle Crop', value: 'circlecrop' },
  { label: 'Smooth Left', value: 'smoothleft' },
  { label: 'Smooth Right', value: 'smoothright' },
  { label: 'Radial', value: 'radial' },
  { label: 'Pixelize', value: 'pixelize' },
  { label: 'Dissolve', value: 'dissolve' }
])

const zoomOptions = computed(() => [
  { label: 'Random (In/Out)', value: 'random' },
  { label: 'Zoom In', value: 'in' },
  { label: 'Zoom Out', value: 'out' },
  { label: 'Static', value: 'none' }
])

function updateSuggestedOutput() {
  if (!subfolderInput.value) {
    subfolderOutput.value = ''
    return
  }
  const folderName = subfolderInput.value.replace(/\\/g, '/').split('/').pop() || 'output'
  if (creatorMode.value === 'root') {
    subfolderOutput.value = `${subfolderInput.value}/${folderName}_slideshow.mp4`.replace(/\\/g, '/')
  } else {
    subfolderOutput.value = `${subfolderInput.value}/output`.replace(/\\/g, '/')
  }
}

async function scanSubfolders() {
  if (!subfolderInput.value || !taskManager.isElectron.value) {
    subfoldersList.value = []
    return
  }
  scanningSubfolders.value = true
  try {
    const list = await window.electronAPI?.tools.ffmpeg.scanImageSubfolders?.(
      subfolderInput.value,
      subfolderExtensions.value,
      creatorMode.value
    )
    subfoldersList.value = list || []
    updateSuggestedOutput()
  } catch (err) {
    console.error('Failed to scan images:', err)
  } finally {
    scanningSubfolders.value = false
  }
}

watch(subfolderInput, () => {
  scanSubfolders()
})

watch(subfolderExtensions, () => {
  scanSubfolders()
}, { deep: true })

watch(creatorMode, () => {
  updateSuggestedOutput()
  scanSubfolders()
})

function onSubmit() {
  if (!subfolderInput.value) {
    toast.add({ title: t('tools.pleaseSelectInputFolder'), color: 'error' })
    return
  }
  if (subfoldersList.value.length === 0) {
    toast.add({
      title: creatorMode.value === 'root' ? t('tools.noImagesInFolder') : t('tools.noSubfoldersFound'),
      color: 'error'
    })
    return
  }
  if (!subfolderOutput.value) {
    toast.add({
      title: creatorMode.value === 'root' ? t('tools.pleaseSelectOutput') : t('tools.pleaseSelectOutputFolder'),
      color: 'error'
    })
    return
  }

  const parts = subfolderResolution.value.split('x')
  const resW = Number(parts[0]) || 1080
  const resH = Number(parts[1]) || 1920

  if (creatorMode.value === 'root') {
    // Single video from root folder images
    const folder = subfoldersList.value[0]
    if (!folder || !folder.images || folder.images.length === 0) {
      toast.add({ title: t('tools.noImagesInFolder'), color: 'error' })
      return
    }

    let images = [...folder.images]
    if (subfolderShuffle.value) {
      images = images.sort(() => Math.random() - 0.5)
    }

    const imageDurations: number[] = []
    let totalDuration = 0
    const minD = Number(subfolderMinDuration.value) || 2.5
    const maxD = Math.max(minD, Number(subfolderMaxDuration.value) || 4.5)

    for (let j = 0; j < images.length; j++) {
      const dur = Number((Math.random() * (maxD - minD) + minD).toFixed(2))
      imageDurations.push(dur)
      if (j === 0) {
        totalDuration = dur
      } else {
        const tDur = Math.min(Number(subfolderTransDuration.value) || 0.8, dur * 0.4, (imageDurations[j - 1] || dur) * 0.4)
        totalDuration += (dur - tDur)
      }
    }

    const outPath = subfolderOutput.value.endsWith('.mp4')
      ? subfolderOutput.value
      : `${subfolderOutput.value}.mp4`

    const tasks: ToolTask[] = [{
      args: [],
      options: {
        encoder: props.selectedEncoder
      },
      meta: {
        taskId: `ff-image-root-${Date.now()}`,
        input: folder.path,
        output: outPath,
        duration: Math.round(totalDuration),
        operation: 'image2video',
        images,
        settings: {
          fps: subfolderFps.value,
          width: resW,
          height: resH,
          bitrate: resW >= 1920 || resH >= 1920 ? '6000k' : '3500k',
          zoomEffect: subfolderZoom.value,
          blurBackground: subfolderBlurBg.value,
          transitionEffect: subfolderTransition.value,
          transitions: subfolderTransitions.value,
          transitionDuration: Number(subfolderTransDuration.value) || 0.8,
          imageDurations,
          audioFile: subfolderAudioFile.value || null,
          audioVolume: 1.0
        },
        threads: 1,
        startedAt: new Date().toISOString()
      }
    }]

    emit('submit', tasks)
    return
  }

  // Multi video from subfolders
  const outDir = subfolderOutput.value || subfolderInput.value

  const tasks: ToolTask[] = subfoldersList.value.map((folder, i) => {
    let images = [...folder.images]
    if (subfolderShuffle.value) {
      images = images.sort(() => Math.random() - 0.5)
    }

    const imageDurations: number[] = []
    let totalDuration = 0
    const minD = Number(subfolderMinDuration.value) || 2.5
    const maxD = Math.max(minD, Number(subfolderMaxDuration.value) || 4.5)

    for (let j = 0; j < images.length; j++) {
      const dur = Number((Math.random() * (maxD - minD) + minD).toFixed(2))
      imageDurations.push(dur)
      if (j === 0) {
        totalDuration = dur
      } else {
        const tDur = Math.min(Number(subfolderTransDuration.value) || 0.8, dur * 0.4, (imageDurations[j - 1] || dur) * 0.4)
        totalDuration += (dur - tDur)
      }
    }

    const outPath = `${outDir}/${folder.name}.mp4`.replace(/\\/g, '/')

    return {
      args: [],
      options: {
        encoder: props.selectedEncoder
      },
      meta: {
        taskId: `ff-subfolder-${Date.now()}-${i}`,
        input: folder.path,
        output: outPath,
        duration: Math.round(totalDuration),
        operation: 'image2video',
        images,
        settings: {
          fps: subfolderFps.value,
          width: resW,
          height: resH,
          bitrate: resW >= 1920 || resH >= 1920 ? '6000k' : '3500k',
          zoomEffect: subfolderZoom.value,
          blurBackground: subfolderBlurBg.value,
          transitionEffect: subfolderTransition.value,
          transitions: subfolderTransitions.value,
          transitionDuration: Number(subfolderTransDuration.value) || 0.8,
          imageDurations,
          audioFile: subfolderAudioFile.value || null,
          audioVolume: 1.0
        },
        threads: subfolderThreads.value,
        startedAt: new Date().toISOString()
      }
    }
  })

  emit('submit', tasks)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Inputs & Outputs -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <UFormField
        name="subfolderInput"
        :label="creatorMode === 'root' ? t('tools.imageFolderRootInput') : t('tools.subfolderInput')"
      >
        <BaseFilePicker
          v-model="subfolderInput"
          mode="folder"
          :placeholder="creatorMode === 'root' ? 'D:/images/my_album' : 'D:/images/parent_folder'"
          :title="creatorMode === 'root' ? t('tools.imageFolderRootInput') : t('tools.subfolderInput')"
          :disabled="disabled"
        />
      </UFormField>

      <UFormField
        name="subfolderOutput"
        :label="creatorMode === 'root' ? t('tools.imageVideoOutput') : t('tools.subfolderOutput')"
      >
        <BaseFilePicker
          v-if="creatorMode === 'root'"
          v-model="subfolderOutput"
          mode="save"
          placeholder="D:/videos/my_album_slideshow.mp4"
          :title="t('tools.imageVideoOutput')"
          :disabled="disabled"
          :filters="[{ name: 'MP4 Video', extensions: ['mp4'] }]"
        />
        <BaseFilePicker
          v-else
          v-model="subfolderOutput"
          mode="folder"
          placeholder="D:/videos/output"
          :title="t('tools.subfolderOutput')"
          :disabled="disabled"
        />
      </UFormField>
    </div>

    <!-- Extension Filters -->
    <UFormField :label="t('tools.supportedExtensions')">
      <USelectMenu
        v-model="subfolderExtensions"
        :items="availableExtensions"
        multiple
        :placeholder="t('tools.supportedExtensions')"
        :search-input="{ icon: 'i-lucide-search', placeholder: t('global.search') }"
        class="w-full"
        :disabled="disabled"
      />
    </UFormField>

    <!-- Images / Subfolders List Preview -->
    <!-- 1. For Root Mode: Show direct images preview -->
    <div
      v-if="creatorMode === 'root' && subfoldersList.length > 0"
      class="p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/30 space-y-2"
    >
      <div class="flex items-center justify-between">
        <p class="font-medium text-sm flex items-center gap-2">
          <UIcon name="i-lucide-image" class="text-primary size-4" />
          {{ t('tools.imagesFoundCount', { count: subfoldersList[0]?.count || 0 }) }}
        </p>
        <UButton
          icon="i-lucide-refresh-cw"
          size="xs"
          variant="ghost"
          :loading="scanningSubfolders"
          @click="scanSubfolders"
        >
          {{ t('tools.scanSubfolders') }}
        </UButton>
      </div>
      <div class="max-h-48 overflow-y-auto space-y-1 pr-1">
        <div
          v-for="(img, idx) in subfoldersList[0]?.images || []"
          :key="img"
          class="flex items-center gap-2 p-1.5 rounded bg-neutral-100 dark:bg-neutral-800/60 text-xs font-mono"
        >
          <span class="text-muted w-6 text-right">{{ idx + 1 }}.</span>
          <UIcon name="i-lucide-file-image" class="size-3.5 text-primary shrink-0" />
          <span class="truncate">{{ img.split('/').pop() }}</span>
        </div>
      </div>
    </div>

    <!-- 2. For Subfolder Mode: Show subfolders tree preview -->
    <div
      v-else-if="creatorMode === 'subfolder' && subfoldersList.length > 0"
      class="p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/30 space-y-2"
    >
      <div class="flex items-center justify-between">
        <p class="font-medium text-sm flex items-center gap-2">
          <UIcon name="i-lucide-folder-tree" class="text-primary size-4" />
          {{ t('tools.subfoldersFound') }} ({{ subfoldersList.length }})
        </p>
        <UButton
          icon="i-lucide-refresh-cw"
          size="xs"
          variant="ghost"
          :loading="scanningSubfolders"
          @click="scanSubfolders"
        >
          {{ t('tools.scanSubfolders') }}
        </UButton>
      </div>
      <div class="max-h-48 overflow-y-auto space-y-1.5 pr-1">
        <div
          v-for="folder in subfoldersList"
          :key="folder.path"
          class="flex items-center justify-between p-2 rounded bg-neutral-100 dark:bg-neutral-800/60 text-xs"
        >
          <div class="flex items-center gap-2 min-w-0">
            <UIcon name="i-lucide-folder" class="text-amber-500 shrink-0 size-4" />
            <span class="font-mono font-medium truncate">{{ folder.name }}</span>
          </div>
          <UBadge color="primary" variant="subtle" size="sm">
            {{ t('tools.imageCount', { count: folder.count }) }}
          </UBadge>
        </div>
      </div>
    </div>
    <div
      v-else-if="subfolderInput && !scanningSubfolders"
      class="p-3 border border-dashed rounded-lg text-center text-xs text-muted"
    >
      {{ creatorMode === 'root' ? t('tools.noImagesInFolder') : t('tools.noSubfolders') }}
    </div>

    <!-- Video Settings for Image2Video -->
    <div
      class="p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/30 space-y-4"
    >
      <p class="font-semibold text-xs text-muted uppercase tracking-wider">
        {{ t('tools.videoForm') }} (Image2Video)
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField :label="t('tools.resolution')">
          <USelect
            v-model="subfolderResolution"
            :items="resolutionOptions"
            class="w-full"
            :disabled="disabled"
          />
        </UFormField>

        <UFormField :label="t('tools.fps')">
          <USelect
            v-model.number="subfolderFps"
            :items="fpsOptions"
            class="w-full"
            :disabled="disabled"
          />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField :label="t('tools.imageDuration')">
          <div class="flex items-center gap-2">
            <UInput
              v-model.number="subfolderMinDuration"
              type="number"
              step="0.5"
              min="1"
              max="60"
              :placeholder="t('tools.minDuration')"
              class="w-full"
              :disabled="disabled"
            />
            <span class="text-muted">-</span>
            <UInput
              v-model.number="subfolderMaxDuration"
              type="number"
              step="0.5"
              min="1"
              max="60"
              :placeholder="t('tools.maxDuration')"
              class="w-full"
              :disabled="disabled"
            />
          </div>
        </UFormField>

        <UFormField v-if="creatorMode === 'subfolder'" :label="t('tools.threads')">
          <UInput
            v-model.number="subfolderThreads"
            type="number"
            min="1"
            max="8"
            class="w-full"
            :disabled="disabled"
          />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField :label="t('tools.transitionEffect')">
          <div class="flex items-center gap-2">
            <USelect
              v-model="subfolderTransition"
              :items="transitionOptions"
              class="flex-1"
              :disabled="disabled"
            />
            <UButton
              v-if="subfolderTransition === 'random'"
              icon="i-lucide-sliders-horizontal"
              color="neutral"
              variant="outline"
              size="sm"
              :title="t('tools.customizeTransitions')"
              :disabled="disabled"
              @click="showTransitionsModal = true"
            >
              {{ subfolderTransitions.length }}
            </UButton>
          </div>
        </UFormField>

        <UFormField :label="t('tools.transitionDuration')">
          <UInput
            v-model.number="subfolderTransDuration"
            type="number"
            step="0.1"
            min="0.1"
            max="3"
            class="w-full"
            :disabled="disabled"
          />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField :label="t('tools.zoomEffect')">
          <USelect
            v-model="subfolderZoom"
            :items="zoomOptions"
            class="w-full"
            :disabled="disabled"
          />
        </UFormField>

        <UFormField :label="t('tools.bgMusic')">
          <BaseFilePicker
            v-model="subfolderAudioFile"
            mode="file"
            placeholder="D:/music/bg.mp3"
            :disabled="disabled"
            :filters="[{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'] }]"
          />
        </UFormField>
      </div>

      <div class="flex flex-wrap items-center gap-6 pt-1">
        <div class="flex items-center gap-2">
          <USwitch v-model="subfolderBlurBg" :disabled="disabled" />
          <span class="text-xs font-medium">{{ t('tools.blurBackground') }}</span>
        </div>
        <div class="flex items-center gap-2">
          <USwitch v-model="subfolderShuffle" :disabled="disabled" />
          <span class="text-xs font-medium">{{ t('tools.shuffleImages') }}</span>
        </div>
      </div>
    </div>

    <!-- Action Button -->
    <div class="pt-2">
      <UButton
        icon="i-lucide-play"
        :label="t('tools.start')"
        variant="soft"
        color="primary"
        size="lg"
        block
        :loading="loading"
        :disabled="!subfolderInput || subfoldersList.length === 0 || disabled"
        @click="onSubmit"
      />
    </div>

    <!-- Transitions Selection Modal -->
    <ToolsVideoTransitionsModal v-model:open="showTransitionsModal" v-model="subfolderTransitions" />
  </div>
</template>
