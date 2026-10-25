<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ToolTask, FfmpegConfig } from '#shared/types/electron'
import { getMediaSize } from '~/utils/ffmpegHelper'

const props = defineProps<{
  disabled?: boolean
  selectedEncoder?: string
  selectedPresetId?: string
  selectedPresetTitle?: string
  config?: Partial<FfmpegConfig>
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', tasks: ToolTask[]): void
  (e: 'update:inputMediaSize', size: { w: number, h: number }): void
  (e: 'update:inputPath', path: string): void
}>()

const { t } = useI18n()
const toast = useToast()
const taskManager = useToolTaskManager('ffmpeg')

const inputPath = ref('')
const outputPath = ref('')
const duration = ref(0)
const inputMediaSize = ref<{ w: number, h: number }>({ w: 1080, h: 1920 })

watch(inputPath, async (newVal) => {
  emit('update:inputPath', newVal)
  if (newVal) {
    const size = await getMediaSize(newVal)
    if (size.w === 0 && size.h === 0) {
      toast.add({
        title: t('tools.invalidMediaFile'),
        description: t('tools.invalidMediaDesc'),
        color: 'error'
      })
      inputMediaSize.value = { w: 1080, h: 1920 }
    } else {
      inputMediaSize.value = size
    }
    emit('update:inputMediaSize', inputMediaSize.value)
    await probeDuration()
  } else {
    inputMediaSize.value = { w: 1080, h: 1920 }
    emit('update:inputMediaSize', inputMediaSize.value)
  }
})

async function probeDuration() {
  if (!inputPath.value) return
  const rs = await taskManager.api?.getMediaInfo?.(['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', inputPath.value])
  if (rs && rs.code === 0) {
    try {
      const info = JSON.parse(rs.stdout)
      duration.value = parseFloat(info?.format?.duration || '0')
    } catch {
      // ignore
    }
  }
}

function onSubmit() {
  if (!inputPath.value) {
    toast.add({ title: t('tools.pleaseSelectInput'), color: 'error' })
    return
  }
  if (!props.selectedPresetId) {
    toast.add({ title: t('tools.pleaseSelectConfig'), color: 'error' })
    return
  }
  const out = outputPath.value || inputPath.value.replace(/\.\w+$/, '_rendered.mp4')
  const plainConfig = props.config ? (JSON.parse(JSON.stringify(props.config)) as FfmpegConfig) : undefined

  const tasks: ToolTask[] = [{
    args: [],
    options: {
      encoder: props.selectedEncoder
    },
    meta: {
      taskId: `ff-single-${Date.now()}`,
      input: inputPath.value,
      output: out,
      duration: duration.value,
      configId: props.selectedPresetId || undefined,
      configTitle: props.selectedPresetTitle,
      config: props.selectedPresetId ? undefined : plainConfig,
      operation: 'render',
      threads: 1,
      startedAt: new Date().toISOString()
    }
  }]

  emit('submit', tasks)
}
</script>

<template>
  <div class="space-y-4">
    <UFormField name="inputPath" :label="t('tools.input')">
      <BaseFilePicker
        v-model="inputPath"
        mode="file"
        placeholder="D:/videos/input.mp4"
        :disabled="disabled"
        :filters="[{ name: 'Videos', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'ts'] }]"
      />
    </UFormField>

    <UFormField :label="t('tools.output')">
      <BaseFilePicker
        v-model="outputPath"
        mode="save"
        placeholder="D:/videos/output.mp4"
        :disabled="disabled"
        :filters="[{ name: 'Videos', extensions: ['mp4'] }]"
      />
    </UFormField>

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
        :disabled="!inputPath || disabled"
        @click="onSubmit"
      />
    </div>
  </div>
</template>
