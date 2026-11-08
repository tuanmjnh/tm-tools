<script setup lang="ts">
import type { DocumentJobView, DocumentRuntimeCapabilities } from '#shared/types/document'
import type { DocumentStudioOperation } from '~/utils/documentStudio'
import { DOCUMENT_STUDIO_OPERATIONS, DOCUMENT_STUDIO_GROUPS, documentStudioOperation, formatBytes } from '~/utils/documentStudio'

const { t } = useI18n()
const api = useDocumentApi()

const capabilities = ref<DocumentRuntimeCapabilities | null>(null)
const available = ref<Set<string>>(new Set())
const jobs = ref<DocumentJobView[]>([])
const loading = ref(true)
const search = ref('')

async function load() {
  loading.value = true
  try {
    const catalog = await api.operations()
    capabilities.value = catalog.capabilities
    // The server decides which operations it can actually execute, so a card
    // with no executor never reaches the page in the first place.
    available.value = new Set(catalog.operations.filter(operation => operation.available).map(operation => operation.id))
  } catch {
    capabilities.value = null
    available.value = new Set()
  }
  try {
    jobs.value = await api.jobs({ limit: '5' })
  } catch {
    jobs.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

const term = computed(() => search.value.trim().toLowerCase())

const groups = computed(() =>
  DOCUMENT_STUDIO_GROUPS
    .map(group => ({
      group,
      operations: DOCUMENT_STUDIO_OPERATIONS
        .filter((operation: DocumentStudioOperation) => available.value.has(operation.id))
        .filter(operation => operation.category === group)
        .filter((operation) => {
          if (!term.value) return true
          return [t(operation.titleKey), t(operation.descriptionKey)]
            .some(text => text.toLowerCase().includes(term.value))
        })
    }))
    .filter(entry => entry.operations.length > 0)
)

const activeJobs = computed(() =>
  jobs.value.filter(job => job.status === 'running' || job.status === 'queued' || job.status === 'publishing')
)

const runtimeLabel = computed(() => {
  const runtime = capabilities.value?.runtime
  return runtime ? t(`document.runtime.${runtime}`) : t('document.runtime.local')
})

function statusColor(status: DocumentJobView['status']): 'neutral' | 'info' | 'success' | 'warning' | 'error' {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'partial' || status === 'cancelled') return 'warning'
  if (status === 'running' || status === 'publishing') return 'info'
  return 'neutral'
}

/** Operation ids with hyphens (`images-to-pdf`) do not match the i18n keys. */
function operationLabel(operationId: string): string {
  const entry = documentStudioOperation(operationId)
  return entry ? t(entry.titleKey) : operationId
}
</script>

<template>
  <BasePage id="document-studio" :title="t('document.home.title')" :description="t('document.home.description')">
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <UInput v-model="search" icon="i-lucide-search" :placeholder="t('document.home.search')"
          class="w-full sm:max-w-xs" />
        <div class="flex items-center gap-2">
          <UButton to="/document-studio/activity" icon="i-lucide-history" color="neutral" variant="soft" size="sm"
            :label="t('document.activity.title')" />
          <div class="flex items-center gap-2 text-xs text-muted">
            <UIcon name="i-lucide-cpu" class="size-4" />
            <span>{{ runtimeLabel }}</span>
          </div>
        </div>
      </div>

      <div v-if="activeJobs.length" class="rounded-lg border border-info/40 bg-info/5 p-3">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-info">
          {{ t('document.home.active', { count: activeJobs.length }) }}
        </p>
        <ul class="space-y-1">
          <li v-for="job in activeJobs" :key="job.id" class="flex items-center justify-between gap-2 text-sm">
            <span class="truncate">{{ operationLabel(job.operationId) }}</span>
            <UBadge :color="statusColor(job.status)" variant="soft" size="sm">
              {{ t(`document.status.${job.status}`) }}
            </UBadge>
          </li>
        </ul>
      </div>

      <div v-if="loading" class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t('common.loading') }}
      </div>

      <template v-else>
        <section v-for="entry in groups" :key="entry.group" class="space-y-2">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
            {{ t(`document.groups.${entry.group}`) }}
          </h2>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <NuxtLink v-for="operation in entry.operations" :key="operation.id" :to="operation.route"
              class="panel-flat flex items-start gap-3 p-4 transition-colors hover:border-primary/60">
              <div class="rounded-md bg-primary/10 p-2">
                <UIcon :name="operation.icon" class="size-5 text-primary" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold">
                  {{ t(operation.titleKey) }}
                </p>
                <p class="mt-0.5 line-clamp-2 text-xs text-muted">
                  {{ t(operation.descriptionKey) }}
                </p>
              </div>
              <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
            </NuxtLink>
          </div>
        </section>

        <section v-if="jobs.length" class="space-y-2">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
            {{ t('document.home.recent') }}
          </h2>
          <ul class="divide-y divide-default/50 rounded-lg border border-default/70">
            <li v-for="job in jobs" :key="job.id" class="flex items-center gap-3 px-3 py-2">
              <UBadge :color="statusColor(job.status)" variant="soft" size="sm">
                {{ t(`document.status.${job.status}`) }}
              </UBadge>
              <span class="min-w-0 flex-1 truncate text-sm">
                {{ operationLabel(job.operationId) }}
              </span>
              <span class="shrink-0 text-xs text-muted">
                {{ t('document.summary.files', { count: job.inputCount }) }}
              </span>
              <span class="hidden shrink-0 text-xs text-muted sm:inline">
                {{ formatBytes(job.totalInputBytes) }}
              </span>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </BasePage>
</template>
