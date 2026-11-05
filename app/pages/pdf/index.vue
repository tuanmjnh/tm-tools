<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { pdfParentPath } from '~/utils/pdfStudio'

const { t } = useI18n()
const { library, loading, busy, refresh, getWorkspaceReport, repairWorkspace } = usePdfStudio()
const { workspaceItems, refreshItem, folderItems } = usePdfMenus()

const aiModelCount = ref(0)
const outputMapping = ref<Record<string, string>>({})
const needsRepair = ref(false)

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

onMounted(async () => {
  void refresh()
  try {
    const res = await $fetch<{ data: unknown[] }>('/api/v1/pdf/extract/models')
    aiModelCount.value = res.data?.length ?? 0
  } catch {
    aiModelCount.value = 0
  }
  await loadReport()
})

async function repair() {
  const result = await repairWorkspace()
  if (result) await Promise.all([refresh(), loadReport()])
}

const mappingRows = computed(() => Object.entries(outputMapping.value))

interface WorkspaceCard {
  key: string
  to: string
  icon: string
  count?: number
}

const workspaces = computed<WorkspaceCard[]>(() => [
  { key: 'library', to: '/pdf/library', icon: 'i-lucide-folder-open', count: library.value?.sources.length },
  { key: 'split', to: '/pdf/split', icon: 'i-lucide-scissors', count: library.value?.split.length },
  { key: 'images', to: '/pdf/images', icon: 'i-lucide-images', count: library.value?.images.length },
  { key: 'export', to: '/pdf/export', icon: 'i-lucide-share-2' },
  { key: 'import', to: '/pdf/import', icon: 'i-lucide-file-input', count: library.value?.inputs.length },
  { key: 'extract', to: '/pdf/extract', icon: 'i-lucide-scan-text', count: library.value?.products.length }
])

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

function cardMenu(card: WorkspaceCard): DropdownMenuItem[] {
  return [
    {
      label: t('pdf.actions.open'),
      icon: 'i-lucide-arrow-right',
      onSelect: () => void navigateTo(card.to)
    },
    {
      label: t('pdf.actions.openNewWindow'),
      icon: 'i-lucide-external-link',
      onSelect: () => {
        if (import.meta.client) window.open(card.to, '_blank', 'popup=yes,width=1280,height=860')
      }
    }
  ]
}
</script>

<template>
  <BasePage id="pdf-overview" :title="t('pdf.title')" :description="t('pdf.description')">
    <template #right>
      <div class="flex items-center gap-1">
        <UButton
          v-if="needsRepair"
          icon="i-lucide-wrench"
          :label="t('pdf.actions.repairWorkspace')"
          color="warning"
          variant="soft"
          size="xs"
          :loading="busy === 'repairWorkspace'"
          :title="t('pdf.overview.repairHint')"
          @click="repair"
        />
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
      </div>
    </template>

    <PdfContextMenu :items="pageMenu">
      <div class="space-y-4 pb-6">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <PdfContextMenu v-for="workspace in workspaces" :key="workspace.key" :items="[cardMenu(workspace)]">
            <NuxtLink
              :to="workspace.to"
              class="panel p-4 space-y-2 block h-full transition hover:border-(--ui-primary)"
            >
              <div class="flex items-center justify-between">
                <div class="grid size-8 place-items-center rounded-(--ui-radius) border border-default text-muted">
                  <UIcon :name="workspace.icon" class="size-4" />
                </div>
                <span class="mono text-lg font-semibold tabular-nums">
                  {{ loading && !library ? '—' : workspace.count ?? '—' }}
                </span>
              </div>
              <div class="space-y-0.5">
                <p class="text-sm font-medium">
                  {{ t(`pdf.workspaces.${workspace.key}.title`) }}
                </p>
                <p class="text-xs leading-relaxed text-muted">
                  {{ t(`pdf.workspaces.${workspace.key}.desc`) }}
                </p>
              </div>
            </NuxtLink>
          </PdfContextMenu>
        </div>

        <div class="grid gap-3 lg:grid-cols-3">
          <section class="panel p-5 lg:col-span-2 space-y-4">
            <header class="space-y-1">
              <h2 class="text-sm font-semibold">
                {{ t('pdf.overview.pipeline.title') }}
              </h2>
              <p class="text-xs text-muted">
                {{ t('pdf.overview.pipeline.description') }}
              </p>
            </header>

            <ol class="space-y-2">
              <li
                v-for="(step, index) in ['import', 'library', 'split', 'images', 'export', 'extract']"
                :key="step"
                class="panel-flat flex items-start gap-3 p-3"
              >
                <span class="mono mt-0.5 text-[10px] text-dimmed">{{ String(index + 1).padStart(2, '0') }}</span>
                <div class="min-w-0 space-y-0.5">
                  <p class="text-sm font-medium">
                    {{ t(`pdf.workspaces.${step}.title`) }}
                  </p>
                  <p class="text-xs leading-relaxed text-muted">
                    {{ t(`pdf.overview.pipeline.${step}Desc`) }}
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section class="panel p-5 space-y-4">
            <header class="space-y-1">
              <h2 class="text-sm font-semibold">
                {{ t('pdf.overview.config.title') }}
              </h2>
              <p class="text-xs text-muted">
                {{ t('pdf.overview.config.description') }}
              </p>
            </header>

            <dl class="space-y-2 text-xs">
              <div v-for="limit in limits" :key="limit.key" class="flex items-center justify-between gap-3">
                <dt class="text-muted">
                  {{ t(`pdf.overview.config.${limit.key}`) }}
                </dt>
                <dd class="mono">
                  {{ limit.value }}
                </dd>
              </div>
            </dl>

            <div class="flex items-center justify-between gap-3 border-t border-default pt-3 text-xs">
              <span class="flex items-center gap-2 text-muted">
                <UIcon name="i-lucide-sparkles" class="size-4" />
                {{ t('pdf.overview.config.ai') }}
              </span>
              <UBadge :color="aiModelCount > 0 ? 'success' : 'warning'" variant="subtle" size="sm">
                {{ aiModelCount > 0 ? t('pdf.overview.config.aiReady') : t('pdf.overview.config.aiMissing') }}
              </UBadge>
            </div>
          </section>

          <section v-if="mappingRows.length" class="panel p-5 space-y-4 lg:col-span-3">
            <header class="space-y-1">
              <h2 class="text-sm font-semibold">
                {{ t('pdf.overview.mapping.title') }}
              </h2>
              <p class="text-xs text-muted">
                {{ t('pdf.overview.mapping.description') }}
              </p>
            </header>

            <dl class="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
              <div
                v-for="[tool, area] in mappingRows"
                :key="tool"
                class="flex items-center justify-between gap-3 rounded-(--ui-radius) border border-default px-3 py-2"
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
      </div>
    </PdfContextMenu>
  </BasePage>
</template>
