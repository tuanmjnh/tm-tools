<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ToolTask, FfmpegConfig } from '~/types'

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
}>()

const { t } = useI18n()
const toast = useToast()
const taskManager = useToolTaskManager('ffmpeg')

const batchPattern = ref('')
const batchOutputPattern = ref('{dirname}/{name}_rendered.{ext}')
const batchThreads = ref(4)
const batchMatchedFiles = ref<string[]>([])
const loadingGlob = ref(false)

function onPickBatchFolder(folder: string) {
  batchPattern.value = `${folder}/*.mp4`.replace(/\\/g, '/')
}

async function triggerGlob() {
  if (!batchPattern.value) {
    batchMatchedFiles.value = []
    return
  }
  loadingGlob.value = true
  try {
    const matched = await taskManager.api!.globFiles?.(batchPattern.value)
    batchMatchedFiles.value = matched || []
  } catch (e) {
    console.error(e)
  } finally {
    loadingGlob.value = false
  }
}

watch(batchPattern, () => {
  triggerGlob()
})

function onSubmit() {
  if (!batchPattern.value || !batchPattern.value.trim()) {
    toast.add({ title: t('tools.inputPatternRequired'), color: 'error' })
    return
  }
  if (batchMatchedFiles.value.length === 0) {
    toast.add({ title: t('tools.noBatchItems'), color: 'error' })
    return
  }
  if (!batchOutputPattern.value || !batchOutputPattern.value.trim()) {
    toast.add({ title: t('tools.outputPatternRequired'), color: 'error' })
    return
  }

  const plainConfig = props.config ? (JSON.parse(JSON.stringify(props.config)) as FfmpegConfig) : undefined
  const tasks: ToolTask[] = batchMatchedFiles.value.map((file, i) => ({
    args: [],
    options: {
      encoder: props.selectedEncoder
    },
    meta: {
      taskId: `ff-batch-${Date.now()}-${i}`,
      input: file,
      outputPattern: batchOutputPattern.value,
      duration: 0,
      configId: props.selectedPresetId || undefined,
      configTitle: props.selectedPresetTitle,
      config: props.selectedPresetId ? undefined : plainConfig,
      operation: 'render',
      threads: batchThreads.value,
      startedAt: new Date().toISOString()
    }
  }))

  emit('submit', tasks)
}
</script>

<template>
  <div class="space-y-4">
    <UFormField name="batchPattern" :label="t('tools.inputPattern')">
      <BaseFilePicker v-model="batchPattern" mode="folder" placeholder="D:/videos/*.mp4"
        :title="t('tools.inputPattern')" :disabled="disabled" @select="onPickBatchFolder" />
    </UFormField>

    <UFormField name="batchOutputPattern" :label="t('tools.outputPattern')">
      <UInput v-model="batchOutputPattern" placeholder="{dirname}/{name}_rendered.{ext}" class="w-full"
        :disabled="disabled" :ui="{ trailing: 'pe-0.5' }" />
    </UFormField>

    <UFormField name="batchThreads" :label="t('tools.threads')">
      <UInput v-model.number="batchThreads" type="number" min="1" max="8" class="w-full" :disabled="disabled" />
    </UFormField>

    <!-- Matched Files Preview -->
    <div v-if="batchMatchedFiles.length"
      class="p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/30">
      <p class="font-medium text-sm mb-2">
        {{ t('tools.batchItems') }} ({{ batchMatchedFiles.length }})
      </p>
      <div class="max-h-48 overflow-y-auto space-y-1">
        <div v-for="file in batchMatchedFiles" :key="file"
          class="text-xs font-mono p-1 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 rounded truncate">
          {{ file }}
        </div>
      </div>
    </div>

    <!-- Action Button -->
    <div class="pt-2">
      <UButton icon="i-lucide-play" :label="t('tools.start')" variant="soft" color="primary" size="lg" block
        :loading="loading" :disabled="!batchPattern || batchMatchedFiles.length === 0 || disabled" @click="onSubmit" />
    </div>
  </div>
</template>
