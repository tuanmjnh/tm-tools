<script setup lang="ts">
import type { YoutubeConfig, YoutubeFormat } from '~/types'

defineOptions({ name: 'ToolsDownloadConfigSlideover' })

const props = withDefaults(defineProps<{
  open?: boolean
  config?: YoutubeConfig | null
  formats?: YoutubeFormat[]
  loading?: boolean
}>(), {
  open: false,
  config: null,
  formats: () => [],
  loading: false
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', data: Partial<YoutubeConfig>): void
}>()

const { t } = useI18n()
const { pickFolder } = useFileSystem()

const isEditing = computed(() => !!props.config?.id)

const form = reactive({
  title: '',
  format_id: '',
  out_path: '',
  file_name: '%(title)s.%(ext)s',
  threads: 4,
  restrict: false,
  overwrite: true,
  encoding: 'utf-8'
})

watch(() => props.open, (open) => {
  if (open) {
    form.title = props.config?.title || ''
    form.format_id = props.config?.format_id || props.formats[0]?.id || ''
    form.out_path = props.config?.out_path || ''
    form.file_name = props.config?.file_name || '%(title)s.%(ext)s'
    form.threads = props.config?.threads || 4
    form.restrict = props.config?.restrict === 1
    form.overwrite = props.config?.overwrite === undefined ? true : props.config?.overwrite === 1
    form.encoding = props.config?.encoding || 'utf-8'
  }
})

const isSaveDisabled = computed(() => props.loading || !form.title.trim())

function onSave() {
  if (isSaveDisabled.value) return
  emit('save', {
    ...form,
    restrict: form.restrict ? 1 : 0,
    overwrite: form.overwrite ? 1 : 0
  })
}

async function pickConfigFolder() {
  const folder = await pickFolder({ title: t('tools.output') })
  if (folder) form.out_path = folder
}
</script>

<template>
  <BaseResponsiveSlideover
    :open="open"
    :title="isEditing ? t('global.edit') : t('global.create')"
    :description="t('tools.configPreset')"
    icon="i-lucide-sliders-horizontal"
    side="right"
    :loading="loading"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('tools.configTitle')" :required="true">
          <UInput v-model="form.title" :placeholder="t('tools.configTitlePrompt')" class="w-full" />
        </UFormField>

        <UFormField :label="t('tools.format')">
          <USelectMenu
            v-model="form.format_id"
            :items="formats.map(f => ({ label: f.title, value: f.id }))"
            :placeholder="t('tools.selectFormat')"
            :search-input="{ placeholder: t('global.search') }"
            value-key="value"
            class="w-full"
          >
            <template #empty>
              {{ t('tools.noFormats') }}
            </template>
          </USelectMenu>
        </UFormField>

        <UFormField :label="t('tools.output')">
          <UInput
            v-model="form.out_path"
            placeholder="D:/Downloads/YouTube"
            :ui="{ trailing: 'pe-0.5' }"
            class="w-full"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-folder-open"
                :title="t('tools.browse')"
                :aria-label="t('tools.browse')"
                @click="pickConfigFolder"
              />
            </template>
          </UInput>
        </UFormField>

        <UFormField :label="t('tools.fileName')">
          <UInput v-model="form.file_name" placeholder="%(title)s.%(ext)s" class="w-full" />
        </UFormField>

        <UFormField :label="t('tools.threads')">
          <UInput
            v-model.number="form.threads"
            type="number"
            min="1"
            max="8"
            class="w-full"
          />
        </UFormField>

        <div class="space-y-3">
          <UCheckbox v-model="form.restrict" :label="t('tools.restrictNames')" />
          <UCheckbox v-model="form.overwrite" :label="t('tools.overwriteFiles')" />
        </div>

        <UFormField :label="t('tools.encoding')">
          <USelectMenu
            v-model="form.encoding"
            :items="['utf-8', 'ascii', 'latin-1']"
            :placeholder="t('tools.encoding')"
            :search-input="{ placeholder: t('global.search') }"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton
        variant="ghost"
        color="neutral"
        :label="t('global.cancel')"
        :disabled="loading"
        @click="emit('update:open', false)"
      />
      <UButton
        variant="soft"
        :label="isEditing ? t('global.update') : t('global.create_new')"
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
