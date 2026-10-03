<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FfmpegConfig, FfmpegLabel } from '~/types'
import type { AspectRatio } from '~/utils/ffmpegHelper'

defineOptions({ name: 'ToolsVideoEffectsForm' })

const config = defineModel<Partial<FfmpegConfig>>({ required: true })

const props = withDefaults(defineProps<{
  aspectRatios?: AspectRatio[]
}>(), {
  aspectRatios: () => [] as AspectRatio[]
})

const { t } = useI18n()
const toast = useToast()

const labelsList = computed({
  get: () => {
    if (Array.isArray(config.value.labels)) {
      return config.value.labels as FfmpegLabel[]
    }
    if (typeof config.value.labels === 'string') {
      try {
        return JSON.parse(config.value.labels) as FfmpegLabel[]
      } catch {
        // ignore
      }
    }
    return []
  },
  set: (val: FfmpegLabel[]) => {
    config.value.labels = val
  }
})

const subtitleModel = computed({
  get: () => config.value.subtitle || '',
  set: (val) => { config.value.subtitle = val }
})

const backgroundFileModel = computed({
  get: () => config.value.background_file || '',
  set: (val) => { config.value.background_file = val }
})

// Labels management local state
const newLabelText = ref('')
const newLabelSize = ref(24)
const newLabelColor = ref('#ffffff')
const newLabelX = ref(50)
const newLabelY = ref(50)

function addLabel() {
  if (!newLabelText.value.trim()) return
  const currentLabels = [...labelsList.value]
  currentLabels.push({
    text: newLabelText.value,
    size: newLabelSize.value,
    color: newLabelColor.value,
    x: newLabelX.value,
    y: newLabelY.value
  })
  labelsList.value = currentLabels
  newLabelText.value = ''
  toast.add({ title: t('tools.configApplied'), color: 'success' })
}

function removeLabel(index: number) {
  const currentLabels = [...labelsList.value]
  currentLabels.splice(index, 1)
  labelsList.value = currentLabels
}

const aspectRatiosOptions = computed(() => {
  if (props.aspectRatios && props.aspectRatios.length) {
    return props.aspectRatios.map(x => ({ label: x.title, value: x.id }))
  }
  return [
    { label: t('tools.aspectOriginal'), value: 0 },
    { label: t('tools.aspect169'), value: 1 },
    { label: t('tools.aspect916'), value: 2 },
    { label: t('tools.aspect11'), value: 3 },
    { label: t('tools.aspect43'), value: 4 }
  ]
})
</script>

<template>
  <UAccordion
    :items="[
      { label: t('tools.aspectRatio'), slot: 'aspect' },
      { label: t('tools.zoom'), slot: 'zoom' },
      { label: t('tools.flips'), slot: 'flips' },
      { label: t('tools.scale'), slot: 'scale' },
      { label: t('tools.speedVolume'), slot: 'speed' },
      { label: t('tools.labels'), slot: 'labels' },
      { label: t('tools.subtitle'), slot: 'subtitle' }
    ]"
    class="border rounded-lg p-2 bg-white dark:bg-gray-900 shadow-sm"
  >
    <template #aspect>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <UFormField :label="t('tools.aspectRatio')">
          <USelect v-model="config.aspect_ratio" :options="aspectRatiosOptions" />
        </UFormField>

        <UFormField v-if="config.aspect_ratio! > 0" :label="t('tools.bgType')">
          <USelect
            v-model="config.background_type"
            :options="[
              { label: 'Color', value: 'color' },
              { label: 'Box Blur', value: 'boxblur' },
              { label: 'Background File', value: 'file' }
            ]"
          />
        </UFormField>

        <UFormField v-if="config.aspect_ratio! > 0 && config.background_type === 'color'" :label="t('tools.bgColor')">
          <div class="flex gap-2">
            <UInput v-model="config.background_color" type="color" class="w-12 h-9 p-0 border-0" />
            <UInput v-model="config.background_color" placeholder="#000000" class="flex-1" />
          </div>
        </UFormField>

        <UFormField v-if="config.aspect_ratio! > 0 && config.background_type === 'boxblur'" :label="t('tools.bgBlur')">
          <div class="flex items-center gap-4">
            <USlider
              v-model="config.background_boxblur"
              :min="5"
              :max="50"
              class="flex-1"
            />
            <span class="text-sm font-medium w-8 text-right">{{ config.background_boxblur }}</span>
          </div>
        </UFormField>

        <UFormField v-if="config.aspect_ratio! > 0 && config.background_type === 'file'" :label="t('tools.bgFile')">
          <BaseFilePicker
            v-model="backgroundFileModel"
            mode="file"
            placeholder="D:/backgrounds/bg.png"
            :filters="[{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }, { name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov'] }]"
          />
        </UFormField>
      </div>
    </template>

    <template #zoom>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <div class="flex items-center gap-2">
          <UCheckbox
            v-model="config.zoom_enable"
            :value="1"
            :unchecked-value="0"
            :label="t('tools.zoomEnable')"
          />
        </div>
        <UFormField v-if="config.zoom_enable === 1" :label="t('tools.zoomRatio')">
          <div class="flex items-center gap-4">
            <USlider
              v-model="config.zoom_ratio"
              :min="1.0"
              :max="2.0"
              :step="0.05"
              class="flex-1"
            />
            <span class="text-sm font-medium w-12 text-right">{{ config.zoom_ratio }}x</span>
          </div>
        </UFormField>
      </div>
    </template>

    <template #flips>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
        <!-- HFLIP -->
        <div class="space-y-4 border-r pr-6">
          <div class="flex items-center gap-2">
            <UCheckbox
              v-model="config.hflip_enable"
              :value="1"
              :unchecked-value="0"
              :label="t('tools.hflip')"
            />
          </div>
          <div v-if="config.hflip_enable === 1" class="space-y-4">
            <UCheckbox
              v-model="config.hflip_all"
              :value="1"
              :unchecked-value="0"
              :label="t('tools.flipAll')"
            />
            <div v-if="config.hflip_all === 0" class="grid grid-cols-2 gap-4">
              <UFormField :label="t('tools.zoomStart')">
                <UInput v-model.number="config.hflip_time_start" type="number" min="0" />
              </UFormField>
              <UFormField :label="t('tools.zoomDuration')">
                <UInput v-model.number="config.hflip_time_duration" type="number" min="1" />
              </UFormField>
            </div>
          </div>
        </div>

        <!-- VFLIP -->
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <UCheckbox
              v-model="config.vflip_enable"
              :value="1"
              :unchecked-value="0"
              :label="t('tools.vflip')"
            />
          </div>
          <div v-if="config.vflip_enable === 1" class="space-y-4">
            <UCheckbox
              v-model="config.vflip_all"
              :value="1"
              :unchecked-value="0"
              :label="t('tools.flipAll')"
            />
            <div v-if="config.vflip_all === 0" class="grid grid-cols-2 gap-4">
              <UFormField :label="t('tools.zoomStart')">
                <UInput v-model.number="config.vflip_time_start" type="number" min="0" />
              </UFormField>
              <UFormField :label="t('tools.zoomDuration')">
                <UInput v-model.number="config.vflip_time_duration" type="number" min="1" />
              </UFormField>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #scale>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <UFormField :label="t('tools.width')">
          <UInput
            v-model.number="config.scale_w"
            type="number"
            min="0"
            placeholder="1920"
          />
        </UFormField>
        <UFormField :label="t('tools.height')">
          <UInput
            v-model.number="config.scale_h"
            type="number"
            min="0"
            placeholder="1080"
          />
        </UFormField>
      </div>
    </template>

    <template #speed>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
        <UFormField :label="t('tools.speed')">
          <div class="flex items-center gap-4">
            <USlider
              v-model="config.speed"
              :min="0.5"
              :max="3.0"
              :step="0.1"
              class="flex-1"
            />
            <span class="text-sm font-medium w-12 text-right">{{ config.speed }}x</span>
          </div>
        </UFormField>
        <UFormField :label="t('tools.volume')">
          <div class="flex items-center gap-4">
            <USlider
              v-model="config.volume"
              :min="0.0"
              :max="3.0"
              :step="0.1"
              class="flex-1"
            />
            <span class="text-sm font-medium w-12 text-right">{{ Math.round(config.volume! * 100) }}%</span>
          </div>
        </UFormField>
      </div>
    </template>

    <template #labels>
      <div class="p-4 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <UFormField :label="t('tools.labelText')">
            <UInput v-model="newLabelText" placeholder="Watermark text" />
          </UFormField>
          <UFormField :label="t('tools.labelSize')">
            <UInput v-model.number="newLabelSize" type="number" />
          </UFormField>
          <UFormField :label="t('tools.labelColor')">
            <UInput v-model="newLabelColor" type="color" />
          </UFormField>
          <UFormField :label="t('tools.labelX')">
            <UInput v-model.number="newLabelX" type="number" />
          </UFormField>
          <UFormField :label="t('tools.labelY')">
            <UInput v-model.number="newLabelY" type="number" />
          </UFormField>
        </div>
        <UButton icon="i-lucide-plus" :label="t('tools.addLabel')" @click="addLabel" />

        <div v-if="labelsList.length" class="overflow-x-auto border rounded-lg mt-4">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b bg-muted/50 text-left text-muted">
                <th class="p-2">
                  {{ t('tools.labelText') }}
                </th>
                <th class="p-2">
                  {{ t('tools.labelSize') }}
                </th>
                <th class="p-2">
                  {{ t('tools.labelColor') }}
                </th>
                <th class="p-2">
                  X / Y
                </th>
                <th class="p-2 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(lbl, idx) in labelsList" :key="idx" class="border-b hover:bg-muted/50">
                <td class="p-2 font-medium">
                  {{ lbl.text }}
                </td>
                <td class="p-2">
                  {{ lbl.size }} px
                </td>
                <td class="p-2 flex items-center gap-2">
                  <span class="w-4 h-4 rounded border inline-block" :style="{ backgroundColor: lbl.color }" />
                  <span>{{ lbl.color }}</span>
                </td>
                <td class="p-2">
                  {{ lbl.x }} / {{ lbl.y }}
                </td>
                <td class="p-2 text-right">
                  <UButton
                    icon="i-lucide-trash-2"
                    size="xs"
                    color="error"
                    variant="ghost"
                    @click="removeLabel(idx)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <template #subtitle>
      <div class="p-4">
        <UFormField :label="t('tools.subtitleFile')">
          <BaseFilePicker
            v-model="subtitleModel"
            mode="file"
            placeholder="D:/subs/subtitle.srt"
            :filters="[{ name: 'Subtitles', extensions: ['srt', 'vtt', 'ass', 'ssa'] }]"
          />
        </UFormField>
      </div>
    </template>
  </UAccordion>
</template>
