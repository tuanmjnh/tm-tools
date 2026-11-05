<script setup lang="ts">
import type { PdfFileArea, PdfLibrary } from '#shared/types/pdf'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfOperationMeta } from '~/utils/pdfOperations'
import { PDF_OPERATIONS, PDF_OPERATION_GROUPS } from '~/utils/pdfOperations'
import { pdfParentPath } from '~/utils/pdfStudio'

const { t } = useI18n()
const { library, loading, refresh, getWorkspaceReport, repairWorkspace } = usePdfStudio()
const { workspaceItems, refreshItem, folderItems } = usePdfMenus()

const aiModelCount = ref(0)
const aiLoaded = ref(false)
const outputMapping = ref<Record<string, string>>({})
const needsRepair = ref(false)
const searchInput = ref('')
const repairing = ref(false)

async function loadReport() {
  try {
    const report = await getWorkspaceReport()
    outputMapping.value = report.outputMapping
    needsRepair.value = report.needsRepair
  } catch {
    outputMapping.value = {}
    needsRepair.value = false
  }
}

async function loadModels() {
  try {
    const res = await $fetch<{ data: unknown[] }>('/api/v1/pdf/extract/models')
    aiModelCount.value = res.data?.length ?? 0
  } catch {
    aiModelCount.value = 0
  } finally {
    aiLoaded.value = true
  }
}

onMounted(() => {
  void refresh()
  void loadModels()
  void loadReport()
})

async function repair() {
  repairing.value = true
  try {
    const result = await repairWorkspace()
    if (result) await Promise.all([refresh(), loadReport()])
  } finally {
    repairing.value = false
  }
}

/** Every card counts what the operation consumes, so the numbers stay comparable. */
const AREA_COUNTS: Record<PdfFileArea, (library: PdfLibrary) => number> = {
  sources: current => current.sources.length,
  inputs: current => current.inputs.length,
  word: current => current.word.length,
  split: current => current.split.length,
  images: current => current.images.length,
  merged: current => current.merged.length,
  products: current => current.products.length,
  office: current => current.office.length
}

function operationArea(operation: PdfOperationMeta): PdfFileArea {
  return operation.input.areas[0] ?? 'sources'
}

function operationCount(operation: PdfOperationMeta): number | null {
  const current = library.value
  return current ? AREA_COUNTS[operationArea(operation)](current) : null
}

const searchTerm = computed(() => searchInput.value.trim().toLowerCase())

function matches(operation: PdfOperationMeta): boolean {
  if (!searchTerm.value) return true
  return [t(operation.titleKey), t(operation.descriptionKey)]
    .some(text => text.toLowerCase().includes(searchTerm.value))
}

const groups = computed(() =>
  PDF_OPERATION_GROUPS
    .map(group => ({ group, operations: PDF_OPERATIONS.filter(operation => operation.group === group && matches(operation)) }))
    .filter(entry => entry.operations.length > 0)
)

const mappingRows = computed(() => Object.entries(outputMapping.value))

const limits = computed(() => [
  { key: 'maxUpload', value: library.value ? `${library.value.maxUploadMb} MB` : '—' },
  { key: 'maxPages', value: library.value ? String(library.value.maxPages) : '—' },
  { key: 'imageScale', value: library.value ? `${library.value.imageScale}×` : '—' }
])

const pageMenu = computed<DropdownMenuItem[][]>(() => [
  [refreshItem(refresh)],
  workspaceItems(),
  folderItems(pdfParentPath(library.value?.sources[0]?.path)).slice(0, 2)
].filter(group => group.length > 0))

function routeMenu(route: string): DropdownMenuItem[] {
  return [
    {
      label: t('pdf.actions.open'),
      icon: 'i-lucide-arrow-right',
      onSelect: () => void navigateTo(route)
    },
    {
      label: t('pdf.actions.openNewWindow'),
      icon: 'i-lucide-external-link',
      onSelect: () => {
        if (import.meta.client) window.open(route, '_blank', 'popup=yes,width=1280,height=860')
      }
    }
  ]
}
</script>

<template>
  <BasePage id="pdf-overview" :title="t('pdf.title')" :description="t('pdf.description')">
    <template #right>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="xs"
        square
        :aria-label="t('pdf.actions.refresh')"
        :loading="loading"
        @click="refresh"
      />
    </template>

    <PdfContextMenu :items="pageMenu">
      <div class="space-y-4 pb-6">
        <section
          v-if="needsRepair"
          class="panel flex flex-wrap items-center justify-between gap-3 p-4"
        >
          <div class="flex min-w-0 items-start gap-3">
            <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0 text-(--ui-warning)" />
            <div class="min-w-0 space-y-0.5">
              <p class="text-sm font-medium">
                {{ t('pdf.overview.repairTitle') }}
              </p>
              <p class="text-xs leading-relaxed text-muted">
                {{ t('pdf.overview.repairHint') }}
              </p>
            </div>
          </div>
          <UButton
            icon="i-lucide-wrench"
            :label="t('pdf.actions.repairWorkspace')"
            color="warning"
            variant="soft"
            size="xs"
            :loading="repairing"
            @click="repair"
          />
        </section>

        <UInput
          v-model="searchInput"
          icon="i-lucide-search"
          :placeholder="t('pdf.overview.search')"
          :aria-label="t('pdf.overview.search')"
          size="sm"
          class="w-full"
        >
          <template v-if="searchInput" #trailing>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="link"
              size="xs"
              :aria-label="t('pdf.browser.clearSearch')"
              @click="searchInput = ''"
            />
          </template>
        </UInput>

        <p v-if="!groups.length" class="panel-flat px-4 py-6 text-center text-xs text-muted">
          {{ t('pdf.overview.noMatch') }}
        </p>

        <div v-else class="grid gap-4 lg:grid-cols-3">
          <section v-for="entry in groups" :key="entry.group" class="space-y-2">
            <h2 class="px-1 text-xs font-semibold tracking-wide text-muted uppercase">
              {{ t(`pdf.overview.groups.${entry.group}`) }}
            </h2>

            <PdfContextMenu
              v-for="operation in entry.operations"
              :key="operation.id"
              :items="[routeMenu(operation.route)]"
            >
              <NuxtLink
                :to="operation.route"
                class="panel block space-y-2 p-4 transition hover:border-(--ui-primary)"
              >
                <div class="flex items-center justify-between">
                  <div class="grid size-8 place-items-center rounded-(--ui-radius) border border-default text-muted">
                    <UIcon :name="operation.icon" class="size-4" />
                  </div>
                  <span class="flex items-baseline gap-1.5">
                    <span class="text-[11px] text-muted">{{ t(`pdf.areas.${operationArea(operation)}`) }}</span>
                    <span class="mono text-lg font-semibold tabular-nums">
                      {{ operationCount(operation) ?? '—' }}
                    </span>
                  </span>
                </div>
                <div class="space-y-0.5">
                  <p class="text-sm font-medium">
                    {{ t(operation.titleKey) }}
                  </p>
                  <p class="text-xs leading-relaxed text-muted">
                    {{ t(operation.descriptionKey) }}
                  </p>
                </div>
              </NuxtLink>
            </PdfContextMenu>
          </section>
        </div>

        <PdfContextMenu :items="[routeMenu('/pdf/library')]">
          <NuxtLink
            to="/pdf/library"
            class="panel flex flex-wrap items-center justify-between gap-3 p-4 transition hover:border-(--ui-primary)"
          >
            <div class="flex min-w-0 items-center gap-3">
              <div class="grid size-9 place-items-center rounded-(--ui-radius) border border-default text-muted">
                <UIcon name="i-lucide-folder-open" class="size-4" />
              </div>
              <div class="min-w-0 space-y-0.5">
                <p class="text-sm font-medium">
                  {{ t('pdf.overview.library.title') }}
                </p>
                <p class="text-xs leading-relaxed text-muted">
                  {{ t('pdf.overview.library.description') }}
                </p>
              </div>
            </div>
            <span class="mono text-lg font-semibold tabular-nums">
              {{ library ? library.sources.length : '—' }}
            </span>
          </NuxtLink>
        </PdfContextMenu>

        <details class="panel p-4 text-xs">
          <summary class="cursor-pointer text-sm font-medium">
            {{ t('pdf.overview.technical') }}
          </summary>

          <div class="mt-4 grid gap-4 lg:grid-cols-2">
            <section class="space-y-2">
              <h3 class="text-xs font-semibold tracking-wide text-muted uppercase">
                {{ t('pdf.overview.config.title') }}
              </h3>
              <dl class="space-y-1.5">
                <div v-for="limit in limits" :key="limit.key" class="flex items-center justify-between gap-3">
                  <dt class="text-muted">
                    {{ t(`pdf.overview.config.${limit.key}`) }}
                  </dt>
                  <dd class="mono">
                    {{ limit.value }}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-3 border-t border-default pt-1.5">
                  <dt class="flex items-center gap-2 text-muted">
                    <UIcon name="i-lucide-sparkles" class="size-4" />
                    {{ t('pdf.overview.config.ai') }}
                  </dt>
                  <dd>
                    <UBadge :color="aiModelCount > 0 ? 'success' : 'warning'" variant="subtle" size="sm">
                      {{ aiModelCount > 0 ? t('pdf.overview.config.aiReady') : t('pdf.overview.config.aiMissing') }}
                    </UBadge>
                  </dd>
                </div>
              </dl>
              <p v-if="aiLoaded && !aiModelCount" class="text-muted">
                {{ t('pdf.errors.aiKeyMissing') }}
              </p>
            </section>

            <section v-if="mappingRows.length" class="space-y-2">
              <h3 class="text-xs font-semibold tracking-wide text-muted uppercase">
                {{ t('pdf.overview.mapping.title') }}
              </h3>
              <dl class="space-y-1.5">
                <div
                  v-for="[tool, area] in mappingRows"
                  :key="tool"
                  class="flex items-center justify-between gap-3"
                >
                  <dt class="truncate text-muted">
                    {{ t(`pdf.overview.mapping.tools.${tool}`) }}
                  </dt>
                  <dd class="shrink-0">
                    <UBadge color="neutral" variant="subtle" size="xs">
                      {{ t(`pdf.areas.${area}`) }}
                    </UBadge>
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </details>
      </div>
    </PdfContextMenu>
  </BasePage>
</template>
