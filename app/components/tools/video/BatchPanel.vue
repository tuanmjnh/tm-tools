<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ToolTask, FfmpegConfig } from '#shared/types/electron'

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

const DEFAULT_BATCH_OUTPUT_PATTERN = '{dirname}/{name}_rendered.{ext}'
const BATCH_OUTPUT_PATTERN_STORAGE_KEY = 'video_batch_output_pattern'
const BATCH_OUTPUT_DIR_STORAGE_KEY = 'tools:video:batch_output_dir'
const BATCH_THREADS_STORAGE_KEY = 'tools:video:threads'

const batchPattern = ref('')
const batchOutputDir = useLocalStorage(BATCH_OUTPUT_DIR_STORAGE_KEY, '')
const batchOutputPattern = useLocalStorage(BATCH_OUTPUT_PATTERN_STORAGE_KEY, DEFAULT_BATCH_OUTPUT_PATTERN)
const batchThreads = useLocalStorage(BATCH_THREADS_STORAGE_KEY, 3)
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

function insertVariable(variable: string) {
  if (!batchOutputPattern.value) {
    batchOutputPattern.value = variable
  } else {
    batchOutputPattern.value += variable
  }
}

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
  if (!props.selectedPresetId) {
    toast.add({ title: t('tools.pleaseSelectConfig'), color: 'error' })
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
      outputDir: batchOutputDir.value.trim() || undefined,
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
      <BaseFilePicker
        v-model="batchPattern"
        mode="folder"
        placeholder="D:/videos/*.mp4"
        :title="t('tools.inputPattern')"
        :disabled="disabled"
        @select="onPickBatchFolder"
      />
    </UFormField>

    <UFormField name="batchOutputDir" :label="t('tools.outputDir')" :hint="t('tools.outputDirHelp')">
      <BaseFilePicker
        v-model="batchOutputDir"
        mode="folder"
        placeholder="D:/videos/output"
        :title="t('tools.outputDir')"
        :disabled="disabled"
        show-clear
      />
    </UFormField>

    <UFormField name="batchOutputPattern">
      <template #label>
        <div class="flex items-center gap-1.5">
          <span>{{ t('tools.outputPattern') }}</span>
          <UPopover :content="{ align: 'start' }">
            <template #default>
              <UButton
                icon="i-lucide-help-circle"
                size="xs"
                color="neutral"
                variant="ghost"
                class="text-neutral-400 hover:text-primary -my-1 p-0.5 cursor-pointer"
                :title="t('tools.variables')"
              />
            </template>
            <template #content>
              <div class="p-3 w-80 space-y-2.5 text-xs">
                <div
                  class="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-1.5"
                >
                  <div class="font-semibold flex items-center gap-1.5 text-neutral-800 dark:text-neutral-200">
                    <UIcon name="i-lucide-variable" class="size-4 text-primary" />
                    <span>{{ t('tools.variables') }}</span>
                  </div>
                  <span class="text-[10px] text-neutral-400 dark:text-neutral-500">
                    {{ t('tools.variablesHelp') }}
                  </span>
                </div>
                <div class="grid grid-cols-2 gap-1.5 text-[11px]">
                  <button
                    type="button"
                    class="p-1.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors flex items-center justify-between group cursor-pointer"
                    @click="insertVariable('{name}')"
                  >
                    <code class="text-primary font-semibold">{name}</code>
                    <span class="text-neutral-500 text-[10px] truncate ml-1">{{ t('tools.varFileName') }}</span>
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors flex items-center justify-between group cursor-pointer"
                    @click="insertVariable('{ext}')"
                  >
                    <code class="text-primary font-semibold">{ext}</code>
                    <span class="text-neutral-500 text-[10px] truncate ml-1">{{ t('tools.varExtension') }}</span>
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors flex items-center justify-between group cursor-pointer"
                    @click="insertVariable('{dirname}')"
                  >
                    <code class="text-primary font-semibold">{dirname}</code>
                    <span class="text-neutral-500 text-[10px] truncate ml-1">{{ t('tools.varParentDir') }}</span>
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors flex items-center justify-between group cursor-pointer"
                    @click="insertVariable('{fulldir}')"
                  >
                    <code class="text-primary font-semibold">{fulldir}</code>
                    <span class="text-neutral-500 text-[10px] truncate ml-1">{{ t('tools.varFullDir') }}</span>
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors flex items-center justify-between group cursor-pointer"
                    @click="insertVariable('{outdir}')"
                  >
                    <code class="text-primary font-semibold">{outdir}</code>
                    <span class="text-neutral-500 text-[10px] truncate ml-1">{{ t('tools.varOutputDir') }}</span>
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors flex items-center justify-between group cursor-pointer"
                    @click="insertVariable('{date}')"
                  >
                    <code class="text-primary font-semibold">{date}</code>
                    <span class="text-neutral-500 text-[10px] truncate ml-1">YYYYMMDD</span>
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors flex items-center justify-between group cursor-pointer"
                    @click="insertVariable('{datetime}')"
                  >
                    <code class="text-primary font-semibold">{datetime}</code>
                    <span class="text-neutral-500 text-[10px] truncate ml-1">YYYYMMDD_HHMMSS</span>
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors flex items-center justify-between group cursor-pointer"
                    @click="insertVariable('{config}')"
                  >
                    <code class="text-primary font-semibold">{config}</code>
                    <span class="text-neutral-500 text-[10px] truncate ml-1">{{ t('tools.varPreset') }}</span>
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors flex items-center justify-between group cursor-pointer"
                    @click="insertVariable('{idx}')"
                  >
                    <code class="text-primary font-semibold">{idx}</code>
                    <span class="text-neutral-500 text-[10px] truncate ml-1">{{ t('tools.varTaskIndex') }}</span>
                  </button>
                </div>
              </div>
            </template>
          </UPopover>
        </div>
      </template>
      <UInput
        v-model="batchOutputPattern"
        :placeholder="DEFAULT_BATCH_OUTPUT_PATTERN"
        class="w-full"
        :disabled="disabled"
        :ui="{ trailing: 'pe-0.5' }"
      >
        <template #trailing>
          <div class="flex items-center gap-0.5">
            <!-- Reset/Default Button -->
            <UButton
              v-if="batchOutputPattern !== DEFAULT_BATCH_OUTPUT_PATTERN"
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-rotate-ccw"
              :title="t('global.reset')"
              :aria-label="t('global.reset')"
              :disabled="disabled"
              @click="batchOutputPattern = DEFAULT_BATCH_OUTPUT_PATTERN"
            />
            <!-- Clear Button -->
            <UButton
              v-if="batchOutputPattern"
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-x"
              :title="t('global.clear')"
              :aria-label="t('global.clear')"
              :disabled="disabled"
              @click="batchOutputPattern = ''"
            />
          </div>
        </template>
      </UInput>
    </UFormField>

    <UFormField name="batchThreads" :label="t('tools.threads')">
      <UInput
        v-model.number="batchThreads"
        type="number"
        min="1"
        max="8"
        class="w-full"
        :disabled="disabled"
      />
    </UFormField>

    <!-- Matched Files Preview -->
    <div
      v-if="batchMatchedFiles.length"
      class="p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/30"
    >
      <p class="font-medium text-sm mb-2">
        {{ t('tools.batchItems') }} ({{ batchMatchedFiles.length }})
      </p>
      <div class="max-h-48 overflow-y-auto space-y-1">
        <div
          v-for="file in batchMatchedFiles"
          :key="file"
          class="text-xs font-mono p-1 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 rounded truncate"
        >
          {{ file }}
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
        :disabled="!batchPattern || batchMatchedFiles.length === 0 || disabled"
        @click="onSubmit"
      />
    </div>
  </div>
</template>
