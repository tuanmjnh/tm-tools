<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ToolTask } from '~/types'

defineProps<{
  disabled?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', tasks: ToolTask[]): void
}>()

const { t } = useI18n()
const toast = useToast()

type AudioAction = 'extract' | 'mute' | 'replace_bgm' | 'mix_bgm'

const audioAction = ref<AudioAction>('extract')
const inputPath = ref('')
const outputPath = ref('')
const audioFormat = ref<'mp3' | 'aac' | 'wav'>('mp3')
const bgmFile = ref('')
const singleVolume = ref(1.0)
const origVolume = ref(1.0)
const bgmVolume = ref(0.4)

const actionOptions = computed(() => [
  {
    label: t('tools.audioExtract'),
    value: 'extract',
    icon: 'i-lucide-music',
    description: t('tools.audioExtractDesc')
  },
  {
    label: t('tools.audioMute'),
    value: 'mute',
    icon: 'i-lucide-volume-x',
    description: t('tools.audioMuteDesc')
  },
  {
    label: t('tools.audioReplace'),
    value: 'replace_bgm',
    icon: 'i-lucide-file-audio',
    description: t('tools.audioReplaceDesc')
  },
  {
    label: t('tools.audioMix'),
    value: 'mix_bgm',
    icon: 'i-lucide-sliders',
    description: t('tools.audioMixDesc')
  }
])

const formatOptions = [
  { label: 'MP3 (MPEG Audio Layer III)', value: 'mp3' },
  { label: 'AAC (Advanced Audio Coding)', value: 'aac' },
  { label: 'WAV (Uncompressed PCM)', value: 'wav' }
]

function autoSuggestOutput() {
  if (!inputPath.value) {
    outputPath.value = ''
    return
  }
  const lastDot = inputPath.value.lastIndexOf('.')
  const basePath = lastDot > 0 ? inputPath.value.substring(0, lastDot) : inputPath.value
  const origExt = lastDot > 0 ? inputPath.value.substring(lastDot) : '.mp4'

  if (audioAction.value === 'extract') {
    outputPath.value = `${basePath}_audio.${audioFormat.value}`
  } else if (audioAction.value === 'mute') {
    outputPath.value = `${basePath}_muted${origExt}`
  } else if (audioAction.value === 'replace_bgm') {
    outputPath.value = `${basePath}_newaudio${origExt}`
  } else if (audioAction.value === 'mix_bgm') {
    outputPath.value = `${basePath}_mixed${origExt}`
  }
}

watch([inputPath, audioAction, audioFormat], () => {
  autoSuggestOutput()
})

function onSubmit() {
  if (!inputPath.value) {
    toast.add({ title: t('tools.pleaseSelectInput'), color: 'error' })
    return
  }
  if (!outputPath.value) {
    autoSuggestOutput()
  }

  if ((audioAction.value === 'replace_bgm' || audioAction.value === 'mix_bgm') && !bgmFile.value) {
    toast.add({ title: t('tools.pleaseSelectAudioFile'), color: 'error' })
    return
  }

  const tasks: ToolTask[] = [{
    args: [],
    meta: {
      taskId: `ff-audio-${Date.now()}`,
      input: inputPath.value,
      output: outputPath.value,
      operation: 'audio_tool',
      audioMode: audioAction.value,
      audioOptions: {
        audioFile: bgmFile.value,
        volume: singleVolume.value,
        origVolume: origVolume.value,
        bgmVolume: bgmVolume.value
      },
      threads: 1,
      startedAt: new Date().toISOString()
    }
  }]

  emit('submit', tasks)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Action Selection Tabs / Pills -->
    <UFormField :label="t('tools.audioAction')">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button v-for="action in actionOptions" :key="action.value" type="button"
          class="flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer"
          :class="[
            audioAction === action.value
              ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs'
              : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 hover:border-neutral-300 dark:hover:border-neutral-700'
          ]" :disabled="disabled" @click="audioAction = action.value as AudioAction">
          <UIcon :name="action.icon" class="size-5 mb-1.5 shrink-0" />
          <span class="text-xs">{{ action.label }}</span>
        </button>
      </div>
    </UFormField>

    <!-- Video Input File -->
    <UFormField name="inputPath" :label="t('tools.inputVideo')">
      <BaseFilePicker v-model="inputPath" mode="file" placeholder="D:/videos/input.mp4" :disabled="disabled"
        :filters="[{ name: 'Videos', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'ts'] }]" />
    </UFormField>

    <!-- Specific options based on selected action -->
    <!-- 1. Extract -->
    <div v-if="audioAction === 'extract'"
      class="p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/30 space-y-3">
      <UFormField :label="t('tools.outputAudioFormat')">
        <USelect v-model="audioFormat" :items="formatOptions" class="w-full" :disabled="disabled" />
      </UFormField>
    </div>

    <!-- 2. Replace Audio -->
    <div v-else-if="audioAction === 'replace_bgm'"
      class="p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/30 space-y-3">
      <UFormField :label="t('tools.newAudioFile')">
        <BaseFilePicker v-model="bgmFile" mode="file" placeholder="D:/music/new_audio.mp3" :disabled="disabled"
          :filters="[{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'] }]" />
      </UFormField>
      <UFormField :label="t('tools.volume')">
        <div class="flex items-center gap-3">
          <input v-model.number="singleVolume" type="range" min="0" max="2" step="0.05" class="flex-1 accent-primary"
            :disabled="disabled">
          <span class="text-xs font-mono w-12 text-right">{{ Math.round(singleVolume * 100) }}%</span>
        </div>
      </UFormField>
    </div>

    <!-- 3. Mix Audio -->
    <div v-else-if="audioAction === 'mix_bgm'"
      class="p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/30 space-y-4">
      <UFormField :label="t('tools.bgMusic')">
        <BaseFilePicker v-model="bgmFile" mode="file" placeholder="D:/music/background_music.mp3" :disabled="disabled"
          :filters="[{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'] }]" />
      </UFormField>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField :label="t('tools.originalAudioVolume')">
          <div class="flex items-center gap-3">
            <input v-model.number="origVolume" type="range" min="0" max="2" step="0.05" class="flex-1 accent-primary"
              :disabled="disabled">
            <span class="text-xs font-mono w-10 text-right">{{ Math.round(origVolume * 100) }}%</span>
          </div>
        </UFormField>
        <UFormField :label="t('tools.bgmVolume')">
          <div class="flex items-center gap-3">
            <input v-model.number="bgmVolume" type="range" min="0" max="2" step="0.05" class="flex-1 accent-primary"
              :disabled="disabled">
            <span class="text-xs font-mono w-10 text-right">{{ Math.round(bgmVolume * 100) }}%</span>
          </div>
        </UFormField>
      </div>
    </div>

    <!-- Output File -->
    <UFormField :label="t('tools.output')">
      <BaseFilePicker v-model="outputPath" mode="save" placeholder="D:/videos/output.mp4" :disabled="disabled" :filters="audioAction === 'extract'
        ? [{ name: 'Audio', extensions: [audioFormat] }]
        : [{ name: 'Videos', extensions: ['mp4', 'mkv', 'mov'] }]" />
    </UFormField>

    <!-- Action Button -->
    <div class="pt-2">
      <UButton icon="i-lucide-play" :label="t('tools.start')" variant="soft" color="primary" size="lg" block
        :loading="loading" :disabled="!inputPath || disabled" @click="onSubmit" />
    </div>
  </div>
</template>
