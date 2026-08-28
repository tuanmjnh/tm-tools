<script setup lang="ts">
import { z } from 'zod'
import type { YoutubeConfig, YoutubeFormat } from '~/types'

defineOptions({ name: 'ToolsDownloadConfigManager' })

const { t } = useI18n()
const toast = useToast()
const { pickFolder } = useFileSystem()

type ConfigRow = {
  id?: string
  title: string
  format_id: string
  out_path: string
  file_name: string
  threads: number
  restrict: boolean
  overwrite: boolean
  encoding: string
  open: boolean
  saving: boolean
  isNew: boolean
}

const isElectron = computed(() => !!window.electronAPI?.tools?.youtube)
const configs = ref<YoutubeConfig[]>([])
const formats = ref<YoutubeFormat[]>([])
const loading = ref(false)

const activeFormats = computed(() => formats.value)

function defaultRow(): ConfigRow {
  return {
    id: '',
    title: '',
    format_id: formats.value[0]?.id || '',
    out_path: '',
    file_name: '%(title)s.%(ext)s',
    threads: 4,
    restrict: false,
    overwrite: true,
    encoding: 'utf-8',
    open: false,
    saving: false,
    isNew: true
  }
}

const rows = ref<ConfigRow[]>([])

const schema = computed(() => z.object({
  title: z.string().min(1, t('tools.configTitle')),
  out_path: z.string().optional(),
  file_name: z.string().optional(),
  threads: z.number().min(1).max(8),
  encoding: z.string().optional()
}))

async function loadFormats() {
  if (!isElectron.value) return
  formats.value = (await window.electronAPI!.tools.youtube.listFormats?.()) || []
}

async function loadConfigs() {
  if (!isElectron.value) return
  loading.value = true
  try {
    const list = (await window.electronAPI!.tools.youtube.listConfigs?.()) || []
    configs.value = list
    rows.value = list.map(c => ({
      id: c.id,
      title: c.title,
      format_id: c.format_id,
      out_path: c.out_path,
      file_name: c.file_name || '%(title)s.%(ext)s',
      threads: c.threads ?? 4,
      restrict: c.restrict === 1,
      overwrite: c.overwrite === undefined ? true : c.overwrite === 1,
      encoding: c.encoding || 'utf-8',
      open: false,
      saving: false,
      isNew: false
    }))
  } finally {
    loading.value = false
  }
}

async function addNew() {
  const fresh = defaultRow()
  fresh.open = true
  rows.value.unshift(fresh)
}

function removeRow(row: ConfigRow) {
  rows.value = rows.value.filter(r => r !== row)
}

async function onCreate(row: ConfigRow) {
  row.saving = true
  try {
    const rs = await window.electronAPI!.tools.youtube.createConfig?.({
      title: row.title,
      format_id: row.format_id,
      out_path: row.out_path,
      file_name: row.file_name || '%(title)s.%(ext)s',
      threads: row.threads,
      restrict: row.restrict ? 1 : 0,
      overwrite: row.overwrite ? 1 : 0,
      encoding: row.encoding || 'utf-8',
      flag: 1
    })
    if (rs?.status) {
      toast.add({ title: t('tools.configSaved'), color: 'success' })
      await loadConfigs()
    } else {
      toast.add({ title: t('tools.configSaveFailed'), color: 'error' })
    }
  } finally {
    row.saving = false
  }
}

async function onUpdate(row: ConfigRow) {
  if (!row.id) return
  row.saving = true
  try {
    const rs = await window.electronAPI!.tools.youtube.updateConfig?.({
      id: row.id,
      data: {
        title: row.title,
        format_id: row.format_id,
        out_path: row.out_path,
        file_name: row.file_name || '%(title)s.%(ext)s',
        threads: row.threads,
        restrict: row.restrict ? 1 : 0,
        overwrite: row.overwrite ? 1 : 0,
        encoding: row.encoding || 'utf-8'
      }
    })
    if (rs?.status) {
      toast.add({ title: t('tools.configSaved'), color: 'success' })
      await loadConfigs()
    } else {
      toast.add({ title: t('tools.configSaveFailed'), color: 'error' })
    }
  } finally {
    row.saving = false
  }
}

async function onDelete(row: ConfigRow) {
  if (!row.id) return
  row.saving = true
  try {
    const rs = await window.electronAPI!.tools.youtube.deleteConfig?.(row.id)
    if (rs?.status) {
      toast.add({ title: t('tools.configDeleted'), color: 'success' })
      await loadConfigs()
    }
  } finally {
    row.saving = false
  }
}

async function pickConfigFolder(row: ConfigRow) {
  const folder = await pickFolder({ title: t('tools.output') })
  if (folder) row.out_path = folder
}

onMounted(() => {
  loadFormats()
  loadConfigs()
})

defineExpose({ reload: loadConfigs })
</script>

<template>
  <div class="space-y-4">
    <div v-if="!isElectron" class="flex flex-col items-center gap-2 py-8 text-muted">
      <UIcon name="i-lucide-monitor" class="text-3xl" />
      <p class="text-sm">
        {{ t('tools.noElectron') }}
      </p>
    </div>

    <div v-else>
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-muted">
          {{ t('tools.savedToSettings') }}
        </p>
        <UButton icon="i-lucide-plus" :label="t('tools.newConfig')" color="primary" variant="subtle" size="sm"
          @click="addNew" />
      </div>

      <div v-if="loading" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-circle" class="size-8 text-muted animate-spin" />
      </div>
      <div v-else-if="rows.length === 0" class="mt-4 flex flex-col items-center gap-2 py-8 text-muted">
        <UIcon name="i-lucide-sliders-horizontal" class="text-3xl" />
        <p class="text-sm">
          {{ t('tools.noConfigs') }}
        </p>
      </div>
      <div v-else class="mt-4 space-y-3">
        <div v-for="(row, index) in rows" :key="row.id || `new-${index}`" class="rounded-lg border border-dashed p-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <UIcon name="i-lucide-sliders-horizontal" class="text-primary size-4 shrink-0" />
              <p class="truncate text-sm font-medium">
                {{ row.title || (row.isNew ? t('tools.newConfig') : '--') }}
              </p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <UButton :icon="row.open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" color="neutral"
                variant="ghost" size="xs" :aria-label="row.open ? t('tools.hide') : t('tools.show')"
                @click="row.open = !row.open" />
              <UButton v-if="!row.isNew" icon="i-lucide-trash-2" color="error" variant="ghost" size="xs"
                :aria-label="t('global.delete')" :loading="row.saving" @click="onDelete(row)" />
            </div>
          </div>

          <UCollapsible v-model:open="row.open" class="mt-1">
            <UCard :ui="{ body: 'space-y-4 p-4' }">
              <UForm :schema="schema" :state="row" @submit="row.isNew ? onCreate(row) : onUpdate(row)">
                <UFormField name="title" :label="t('tools.configTitle')" required>
                  <UInput v-model="row.title" :placeholder="t('tools.configTitlePrompt')" class="w-full" />
                </UFormField>

                <UFormField name="format_id" :label="t('tools.format')">
                  <USelectMenu v-model="row.format_id"
                    :items="activeFormats.map(f => ({ label: f.title, value: f.id }))"
                    :placeholder="t('tools.selectFormat')" :search-input="{ placeholder: t('global.search') }"
                    value-key="value" class="w-full">
                    <template #empty>
                      {{ t('tools.noFormats') }}
                    </template>
                  </USelectMenu>
                </UFormField>

                <UFormField name="out_path" :label="t('tools.output')">
                  <UInput v-model="row.out_path" placeholder="D:/Downloads/YouTube" :ui="{ trailing: 'pe-0.5' }"
                    class="w-full">
                    <template #trailing>
                      <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-folder-open"
                        :title="t('tools.browse')" :aria-label="t('tools.browse')" @click="pickConfigFolder(row)" />
                    </template>
                  </UInput>
                </UFormField>

                <UFormField name="file_name" :label="t('tools.fileName')">
                  <UInput v-model="row.file_name" placeholder="%(title)s.%(ext)s" class="w-full" />
                </UFormField>

                <UFormField name="threads" :label="t('tools.threads')">
                  <UInput v-model.number="row.threads" type="number" min="1" max="8" class="w-full" />
                </UFormField>

                <UFormField name="encoding" :label="t('tools.encoding')">
                  <USelectMenu v-model="row.encoding" :items="['utf-8', 'ascii', 'latin-1']"
                    :placeholder="t('tools.encoding')" :search-input="{ placeholder: t('global.search') }"
                    class="w-full" />
                </UFormField>

                <div class="space-y-3">
                  <UCheckbox v-model="row.restrict" :label="t('tools.restrictNames')" />
                  <UCheckbox v-model="row.overwrite" :label="t('tools.overwriteFiles')" />
                </div>
              </UForm>

              <div class="flex justify-end gap-2 pt-2">
                <UButton v-if="row.isNew" variant="ghost" color="neutral" :label="t('global.cancel')"
                  :disabled="row.saving" @click="removeRow(row)" />
                <UButton icon="i-lucide-save" :label="row.isNew ? t('global.create') : t('global.update')"
                  color="primary" :loading="row.saving" :disabled="!row.title.trim()"
                  @click="row.isNew ? onCreate(row) : onUpdate(row)" />
              </div>
            </UCard>
          </UCollapsible>
        </div>
      </div>
    </div>
  </div>
</template>
