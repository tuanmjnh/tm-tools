<script setup lang="ts">
import type { HubExportJob, HubExportTemplate } from 'tm-hub-client'

definePageMeta({
  middleware: () => {
    if (import.meta.client) {
      const a = useAuth()
      if (!a.isAuthenticated.value) return navigateTo('/login')
    }
  }
})

const { t } = useI18n()

const {
  MODULES,
  FORMATS,
  SCOPES,
  jobs,
  jobTotal,
  loadingJobs,
  starting,
  downloadingId,
  page,
  pageSize,
  templates,
  loadingTemplates,
  savingTemplate,
  filters,
  form,
  loadJobs,
  start,
  download,
  remove,
  loadTemplates,
  saveAsTemplate,
  applyTemplate,
  removeTemplate
} = useExport()

const templateName = ref('')

const deletingJob = ref<HubExportJob | null>(null)
const isDeleteJobOpen = ref(false)
const deletingTemplate = ref<HubExportTemplate | null>(null)
const isDeleteTemplateOpen = ref(false)

onMounted(() => {
  loadJobs(1)
  loadTemplates()
})

const moduleItems = computed(() => MODULES.map(m => ({ value: m as string, label: t(`admin.export.modules.${m}`) })))
const moduleFilterItems = computed(() => [
  { value: 'all', label: t('common.all') },
  ...moduleItems.value
])
const formatItems = computed(() => FORMATS.map(f => ({ value: f, label: f.toUpperCase() })))
const scopeItems = computed(() => SCOPES.map(s => ({ value: s, label: t(`admin.export.scopes.${s}`) })))

function statusColor(status: HubExportJob['status']): 'success' | 'info' | 'warning' | 'error' {
  if (status === 'completed') return 'success'
  if (status === 'processing') return 'info'
  if (status === 'pending') return 'warning'
  return 'error'
}

function formatSize(bytes?: number): string {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function askDeleteJob(job: HubExportJob) {
  deletingJob.value = job
  isDeleteJobOpen.value = true
}

function askDeleteTemplate(tpl: HubExportTemplate) {
  deletingTemplate.value = tpl
  isDeleteTemplateOpen.value = true
}
</script>

<template>
  <BasePage id="admin-export" :title="$t('admin.export.title')">
    <template #right>
      <UButton
        :label="t('common.refresh')"
        variant="outline"
        color="neutral"
        size="sm"
        icon="i-lucide-refresh-cw"
        :loading="loadingJobs"
        @click="loadJobs(page)"
      />
    </template>

    <div class="flex flex-col gap-4 pb-6 max-w-6xl">
      <p class="text-sm text-muted">
        {{ $t('admin.export.description') }}
      </p>

      <div class="grid lg:grid-cols-3 gap-4">
        <div class="border border-default rounded-lg bg-default/50 p-4 space-y-4">
          <h3 class="font-medium text-sm text-highlighted">
            {{ t('admin.export.formTitle') }}
          </h3>

          <USelect
            v-model="form.module"
            :items="moduleItems"
            size="sm"
            :label="t('admin.export.module')"
          />
          <USelect
            v-model="form.format"
            :items="formatItems"
            size="sm"
            :label="t('admin.export.format')"
          />
          <USelect
            v-model="form.scope"
            :items="scopeItems"
            size="sm"
            :label="t('admin.export.scope')"
          />
          <UInput
            v-if="form.scope === 'page'"
            v-model="form.limit"
            type="number"
            size="sm"
            :min="1"
            :max="10000"
            :label="t('admin.export.pageLimit')"
          />

          <UButton
            :label="starting ? t('admin.export.starting') : t('admin.export.start')"
            icon="i-lucide-download"
            :loading="starting"
            block
            @click="start"
          />

          <div class="flex gap-2 pt-2 border-t border-default">
            <UInput
              v-model="templateName"
              :placeholder="t('admin.export.templateName')"
              size="sm"
              class="flex-1"
            />
            <UButton
              :label="t('admin.export.saveAsTemplate')"
              variant="soft"
              color="neutral"
              size="sm"
              :loading="savingTemplate"
              @click="saveAsTemplate(templateName)"
            />
          </div>
        </div>

        <div class="lg:col-span-2 border border-default rounded-lg bg-default/50 p-4 space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-medium text-sm text-highlighted">
              {{ t('admin.export.jobsTitle') }}
            </h3>
            <USelect
              v-model="filters.module"
              :items="moduleFilterItems"
              size="sm"
              class="w-44"
              @update:model-value="loadJobs(1)"
            />
          </div>

          <div v-if="loadingJobs" class="py-8 text-center text-sm text-muted">
            {{ t('common.loading') }}
          </div>
          <div v-else-if="!jobs.length" class="py-8 text-center text-sm text-muted">
            {{ t('admin.export.noJobs') }}
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-default text-left text-muted">
                  <th class="py-2 pr-3 font-medium">
                    {{ t('admin.export.module') }}
                  </th>
                  <th class="pr-3 font-medium">
                    {{ t('admin.export.format') }}
                  </th>
                  <th class="pr-3 font-medium">
                    {{ t('common.status') }}
                  </th>
                  <th class="pr-3 font-medium">
                    {{ t('admin.export.records') }}
                  </th>
                  <th class="pr-3 font-medium">
                    {{ t('admin.export.size') }}
                  </th>
                  <th class="pr-3 font-medium">
                    {{ t('admin.export.created') }}
                  </th>
                  <th class="font-medium text-right">
                    {{ t('common.actions') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="job in jobs" :key="job.id" class="border-b border-default/50">
                  <td class="py-2 pr-3">
                    {{ t(`admin.export.modules.${job.module}`) }}
                  </td>
                  <td class="pr-3 uppercase">
                    {{ job.format }}
                  </td>
                  <td class="pr-3">
                    <UBadge :color="statusColor(job.status)" variant="soft" size="sm">
                      {{ t(`admin.export.statuses.${job.status}`) }}
                    </UBadge>
                  </td>
                  <td class="pr-3">
                    {{ job.totalRecords }}
                  </td>
                  <td class="pr-3">
                    {{ formatSize(job.fileSize) }}
                  </td>
                  <td class="pr-3 whitespace-nowrap">
                    {{ formatDateTime(job.createdAt) }}
                  </td>
                  <td class="text-right whitespace-nowrap">
                    <div class="inline-flex gap-1">
                      <UButton
                        v-if="job.status === 'completed'"
                        size="xs"
                        variant="soft"
                        color="neutral"
                        icon="i-lucide-download"
                        :loading="downloadingId === job.id"
                        @click="download(job)"
                      />
                      <UButton
                        size="xs"
                        variant="soft"
                        color="error"
                        icon="i-lucide-trash-2"
                        @click="askDeleteJob(job)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="!loadingJobs && jobs.length" class="flex items-center justify-between border-t border-default pt-3">
            <span class="text-sm text-muted">{{ jobTotal }}</span>
            <div class="flex gap-2">
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                :disabled="page <= 1"
                @click="loadJobs(page - 1)"
              >
                ‹
              </UButton>
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                :disabled="page * pageSize >= jobTotal"
                @click="loadJobs(page + 1)"
              >
                ›
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <div class="border border-default rounded-lg bg-default/50 p-4 space-y-4">
        <h3 class="font-medium text-sm text-highlighted">
          {{ t('admin.export.templatesTitle') }}
        </h3>

        <div v-if="loadingTemplates" class="py-4 text-center text-sm text-muted">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="!templates.length" class="py-4 text-center text-sm text-muted">
          {{ t('admin.export.noJobs') }}
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-default text-left text-muted">
                <th class="py-2 pr-3 font-medium">
                  {{ t('admin.export.templateName') }}
                </th>
                <th class="pr-3 font-medium">
                  {{ t('admin.export.module') }}
                </th>
                <th class="pr-3 font-medium">
                  {{ t('admin.export.format') }}
                </th>
                <th class="pr-3 font-medium">
                  {{ t('admin.export.scope') }}
                </th>
                <th class="font-medium text-right">
                  {{ t('common.actions') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tpl in templates" :key="tpl.id" class="border-b border-default/50">
                <td class="py-2 pr-3">
                  {{ tpl.name }}
                </td>
                <td class="pr-3">
                  {{ t(`admin.export.modules.${tpl.module}`) }}
                </td>
                <td class="pr-3 uppercase">
                  {{ tpl.options?.format }}
                </td>
                <td class="pr-3">
                  {{ t(`admin.export.scopes.${tpl.options?.scope}`) }}
                </td>
                <td class="text-right whitespace-nowrap">
                  <div class="inline-flex gap-1">
                    <UButton
                      size="xs"
                      variant="soft"
                      color="neutral"
                      icon="i-lucide-check"
                      @click="applyTemplate(tpl)"
                    />
                    <UButton
                      size="xs"
                      variant="soft"
                      color="error"
                      icon="i-lucide-trash-2"
                      @click="askDeleteTemplate(tpl)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <LazyBaseConfirmModal
      v-model:open="isDeleteJobOpen"
      :title="t('admin.export.deleteJobConfirm')"
      :description="deletingJob ? `${t(`admin.export.modules.${deletingJob.module}`)} · ${deletingJob.id}` : ''"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      color="error"
      icon="i-lucide-trash-2"
      @confirm="deletingJob && (remove(deletingJob), isDeleteJobOpen = false)"
    />

    <LazyBaseConfirmModal
      v-model:open="isDeleteTemplateOpen"
      :title="t('admin.export.deleteTemplateConfirm')"
      :description="deletingTemplate?.name || ''"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      color="error"
      icon="i-lucide-trash-2"
      @confirm="deletingTemplate && (removeTemplate(deletingTemplate), isDeleteTemplateOpen = false)"
    />
  </BasePage>
</template>
