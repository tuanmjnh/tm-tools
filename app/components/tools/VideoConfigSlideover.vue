<script setup lang="ts">
import type { FfmpegConfig, FfmpegLabel } from '~/types'

defineOptions({ name: 'ToolsVideoConfigSlideover' })

const props = withDefaults(defineProps<{
  open?: boolean
  config?: FfmpegConfig | null
  loading?: boolean
}>(), {
  open: false,
  config: null,
  loading: false
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', data: Partial<FfmpegConfig>): void
}>()

const { t } = useI18n()
const { pickFile } = useFileSystem()

const isEditing = computed(() => !!props.config?.id)

const form = reactive({
  title: '',
  aspect_ratio: 0,
  background_type: 'color' as 'color' | 'boxblur' | 'file',
  background_color: '#000000',
  background_boxblur: 10,
  background_file: '',
  center: 1,
  speed: 1,
  volume: 1,
  zoom_enable: 0,
  zoom_ratio: 1.1,
  zoom_time_start: 0,
  zoom_time_duration: 0,
  zoom_time_loop: 0,
  hflip_enable: 0,
  hflip_all: 1,
  hflip_time_start: 0,
  hflip_time_duration: 0,
  hflip_time_loop: 0,
  vflip_enable: 0,
  vflip_all: 1,
  vflip_time_start: 0,
  vflip_time_duration: 0,
  vflip_time_loop: 0,
  scale_x: 0,
  scale_y: 0,
  scale_w: 0,
  scale_h: 0,
  labels: [] as FfmpegLabel[],
  files: [] as string[],
  subtitle: '',
  render_code: ''
})

watch(() => props.open, (open) => {
  if (open) {
    const c = props.config
    form.title = c?.title || ''
    form.aspect_ratio = c?.aspect_ratio ?? 0
    form.background_type = c?.background_type || 'color'
    form.background_color = c?.background_color || '#000000'
    form.background_boxblur = c?.background_boxblur ?? 10
    form.background_file = c?.background_file || ''
    form.center = c?.center ?? 1
    form.speed = c?.speed ?? 1
    form.volume = c?.volume ?? 1
    form.zoom_enable = c?.zoom_enable ?? 0
    form.zoom_ratio = c?.zoom_ratio ?? 1.1
    form.zoom_time_start = c?.zoom_time_start ?? 0
    form.zoom_time_duration = c?.zoom_time_duration ?? 0
    form.zoom_time_loop = c?.zoom_time_loop ?? 0
    form.hflip_enable = c?.hflip_enable ?? 0
    form.hflip_all = c?.hflip_all ?? 1
    form.hflip_time_start = c?.hflip_time_start ?? 0
    form.hflip_time_duration = c?.hflip_time_duration ?? 0
    form.hflip_time_loop = c?.hflip_time_loop ?? 0
    form.vflip_enable = c?.vflip_enable ?? 0
    form.vflip_all = c?.vflip_all ?? 1
    form.vflip_time_start = c?.vflip_time_start ?? 0
    form.vflip_time_duration = c?.vflip_time_duration ?? 0
    form.vflip_time_loop = c?.vflip_time_loop ?? 0
    form.scale_x = c?.scale_x ?? 0
    form.scale_y = c?.scale_y ?? 0
    form.scale_w = c?.scale_w ?? 0
    form.scale_h = c?.scale_h ?? 0
    form.labels = parseJsonArray(c?.labels) as FfmpegLabel[]
    form.files = parseJsonArray(c?.files) as string[]
    form.subtitle = c?.subtitle || ''
    form.render_code = c?.render_code || ''
  }
})

function parseJsonArray(value: string | unknown[] | null | undefined): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return []
    }
  }
  return []
}

const isSaveDisabled = computed(() => props.loading || !form.title.trim())

function onSave() {
  if (isSaveDisabled.value) return
  emit('save', { ...form })
}

async function pickBackgroundFile() {
  const file = await pickFile({
    title: t('tools.bgFile'),
    filters: [
      { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] },
      { name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov'] }
    ]
  })
  if (typeof file === 'string' && file) form.background_file = file
}

async function pickSubtitleFile() {
  const file = await pickFile({
    title: t('tools.subtitleFile'),
    filters: [{ name: 'Subtitles', extensions: ['srt', 'vtt', 'ass', 'ssa'] }]
  })
  if (typeof file === 'string' && file) form.subtitle = file
}
</script>

<template>
  <BaseResponsiveSlideover
    :open="open"
    :title="isEditing ? t('common.edit') : t('common.create')"
    :description="t('tools.configPreset')"
    icon="i-lucide-sliders-horizontal"
    side="right"
    :loading="loading"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('tools.configTitle')" :required="true">
          <UInput v-model="form.title" :placeholder="t('tools.configTitlePrompt')" />
        </UFormField>

        <UFormField :label="t('tools.aspectRatio')">
          <USelect
            v-model.number="form.aspect_ratio"
            :options="[
              { label: t('tools.aspectOriginal'), value: 0 },
              { label: t('tools.aspect169'), value: 1 },
              { label: t('tools.aspect916'), value: 2 },
              { label: t('tools.aspect11'), value: 3 },
              { label: t('tools.aspect43'), value: 4 }
            ]"
          />
        </UFormField>

        <template v-if="form.aspect_ratio! > 0">
          <UFormField :label="t('tools.bgType')">
            <USelect
              v-model="form.background_type"
              :options="[
                { label: 'Color', value: 'color' },
                { label: 'Box Blur', value: 'boxblur' },
                { label: 'Background File', value: 'file' }
              ]"
            />
          </UFormField>

          <UFormField v-if="form.background_type === 'color'" :label="t('tools.bgColor')">
            <div class="flex gap-2">
              <UInput v-model="form.background_color" type="color" class="w-12 h-9 p-0 border-0" />
              <UInput v-model="form.background_color" placeholder="#000000" class="flex-1" />
            </div>
          </UFormField>

          <UFormField v-else-if="form.background_type === 'boxblur'" :label="t('tools.bgBlur')">
            <div class="flex items-center gap-4">
              <USlider
                v-model="form.background_boxblur"
                :min="5"
                :max="50"
                class="flex-1"
              />
              <span class="text-sm font-medium w-8 text-right">{{ form.background_boxblur }}</span>
            </div>
          </UFormField>

          <UFormField v-else :label="t('tools.bgFile')">
            <UInput v-model="form.background_file" placeholder="D:/backgrounds/bg.png" :ui="{ trailing: 'pe-1' }">
              <template #trailing>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-folder-open"
                  :title="t('tools.browse')"
                  :aria-label="t('tools.browse')"
                  @click="pickBackgroundFile"
                />
              </template>
            </UInput>
          </UFormField>
        </template>

        <UFormField :label="t('tools.speed')">
          <div class="flex items-center gap-4">
            <USlider
              v-model="form.speed"
              :min="0.5"
              :max="3.0"
              :step="0.1"
              class="flex-1"
            />
            <span class="text-sm font-medium w-12 text-right">{{ form.speed }}x</span>
          </div>
        </UFormField>

        <UFormField :label="t('tools.volume')">
          <div class="flex items-center gap-4">
            <USlider
              v-model="form.volume"
              :min="0.0"
              :max="3.0"
              :step="0.1"
              class="flex-1"
            />
            <span class="text-sm font-medium w-12 text-right">{{ Math.round(form.volume * 100) }}%</span>
          </div>
        </UFormField>

        <div class="flex items-center gap-2">
          <UCheckbox
            v-model="form.zoom_enable"
            :value="1"
            :unchecked-value="0"
            :label="t('tools.zoomEnable')"
          />
        </div>
        <UFormField v-if="form.zoom_enable === 1" :label="t('tools.zoomRatio')">
          <div class="flex items-center gap-4">
            <USlider
              v-model="form.zoom_ratio"
              :min="1.0"
              :max="2.0"
              :step="0.05"
              class="flex-1"
            />
            <span class="text-sm font-medium w-12 text-right">{{ form.zoom_ratio }}x</span>
          </div>
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <div class="flex items-center gap-2">
            <UCheckbox
              v-model="form.hflip_enable"
              :value="1"
              :unchecked-value="0"
              :label="t('tools.hflip')"
            />
          </div>
          <div class="flex items-center gap-2">
            <UCheckbox
              v-model="form.vflip_enable"
              :value="1"
              :unchecked-value="0"
              :label="t('tools.vflip')"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <UFormField :label="t('tools.width')">
            <UInput
              v-model.number="form.scale_w"
              type="number"
              min="0"
              placeholder="1920"
            />
          </UFormField>
          <UFormField :label="t('tools.height')">
            <UInput
              v-model.number="form.scale_h"
              type="number"
              min="0"
              placeholder="1080"
            />
          </UFormField>
        </div>

        <UFormField :label="t('tools.subtitleFile')">
          <UInput v-model="form.subtitle" placeholder="D:/subs/subtitle.srt" :ui="{ trailing: 'pe-1' }">
            <template #trailing>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-folder-open"
                :title="t('tools.browse')"
                :aria-label="t('tools.browse')"
                @click="pickSubtitleFile"
              />
            </template>
          </UInput>
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton
        variant="ghost"
        color="neutral"
        :label="t('common.cancel')"
        :disabled="loading"
        @click="emit('update:open', false)"
      />
      <UButton
        :label="isEditing ? t('common.update') : t('common.create')"
        color="primary"
        icon="i-lucide-save"
        :loading="loading"
        :disabled="isSaveDisabled"
        @click="onSave"
      />
    </template>
  </BaseResponsiveSlideover>
</template>

<style scoped></style>
