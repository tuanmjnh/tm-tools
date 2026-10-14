<script setup lang="ts">
import type { HeaderAction } from '~/components/base/HeaderActions.vue'
import type { TmcutProject } from '~/composables/useTmcutProject'
import { canvasFpsValue } from '~/utils/tmcut/canvas'

const { t, locale } = useI18n()
const {
  projects,
  createProject,
  deleteProject,
  renameProject,
  duplicateProject,
  togglePinProject,
  refreshProjects
} = useTmcutProject()
const router = useRouter()

// Honest hardware label (same detection as the editor header chip)
const hasWebGPU = ref(false)
const hardwareLabel = computed(() => (
  `${hasWebGPU.value ? 'WebGPU' : 'WebGL'} · FFmpeg`
))

onMounted(() => {
  hasWebGPU.value = typeof navigator !== 'undefined' && 'gpu' in navigator
  refreshProjects()
})

// ===== Project helpers =====

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

// Simplest aspect label: 1920x1080 → "16:9"; odd sizes stay raw W:H
function aspectLabel(project: TmcutProject): string {
  const w = project.canvas?.width || 1920
  const h = project.canvas?.height || 1080
  const g = gcd(w, h)
  const rw = Math.round(w / g)
  const rh = Math.round(h / g)
  return rw <= 64 && rh <= 64 ? `${rw}:${rh}` : `${w}:${h}`
}

function aspectKey(project: TmcutProject): 'vertical' | 'horizontal' | 'square' {
  const w = project.canvas?.width || 1920
  const h = project.canvas?.height || 1080
  if (h > w) return 'vertical'
  if (w > h) return 'horizontal'
  return 'square'
}

// Honest resolution badge derived from canvas width
function resBadge(project: TmcutProject): string {
  const w = project.canvas?.width || 0
  if (w >= 3840) return '4K UHD'
  if (w >= 2560) return '1440p'
  if (w >= 1920) return '1080p'
  if (w >= 1280) return '720p'
  return ''
}

function fmtDuration(project: TmcutProject): string {
  const totalSec = Math.round((project.durationMs || 0) / 1000)
  if (totalSec <= 0) return ''
  const hrs = Math.floor(totalSec / 3600)
  const min = Math.floor((totalSec % 3600) / 60)
  const sec = totalSec % 60
  const mm = String(min).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`
}

function editedLabel(project: TmcutProject): string {
  const date = new Date(project.updated_at || project.created_at)
  const formatted = Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
  return t('tmcut.home.editedAt', { date: formatted })
}

// ===== Create actions (all real: preset canvas, then open the editor) =====

function handleNewProject() {
  const proj = createProject(t('tmcut.newProject'))
  router.push(`/tmcut/editor?project=${proj.id}`)
}

function openProject(id: string) {
  router.push(`/tmcut/editor?project=${id}`)
}

// Quick-action presets mirror /tmcut/templates applyPreset: create the
// project with the right canvas so the card is more than a nav link.
type QuickPreset = { id: string, width: number, height: number, fps: number, nameKey: string, descKey: string, icon: string }

const quickPresets: QuickPreset[] = [
  { id: 'quick-vertical', width: 1080, height: 1920, fps: 30, nameKey: 'tmcut.home.actionVertical', descKey: 'tmcut.home.actionVerticalDesc', icon: 'i-lucide-smartphone' },
  { id: 'quick-horizontal', width: 1920, height: 1080, fps: 30, nameKey: 'tmcut.home.actionHorizontal', descKey: 'tmcut.home.actionHorizontalDesc', icon: 'i-lucide-monitor' }
]

function applyQuickPreset(preset: QuickPreset) {
  // Canvas passed AT CREATION: patching the raw object returned by
  // createProject() never re-saved, and the editor's loadProject() read
  // the storage mirror (default canvas) — presets silently lost (R92).
  const project = createProject(t('tmcut.newProject'), { width: preset.width, height: preset.height, fps: { numerator: preset.fps, denominator: 1 } })
  router.push(`/tmcut/editor?project=${project.id}`)
}

// Template presets strip (real data — same list as /tmcut/templates)
const templatePresets = computed(() => [
  { id: 'preset-shorts-vertical', name: t('tmcut.presets.shortsName'), canvas: '1080x1920', fps: 30, icon: 'i-lucide-smartphone' },
  { id: 'preset-youtube-horizontal', name: t('tmcut.presets.youtubeName'), canvas: '1920x1080', fps: 30, icon: 'i-lucide-monitor' },
  { id: 'preset-instagram-feed', name: t('tmcut.presets.instagramName'), canvas: '1080x1080', fps: 30, icon: 'i-lucide-square' }
])

function applyTemplatePreset(preset: { canvas: string, name: string, fps: number }) {
  const parts = preset.canvas.split('x').map(Number)
  const project = createProject(`${t('tmcut.project')} ${preset.name}`, { width: parts[0] || 1920, height: parts[1] || 1080, fps: { numerator: preset.fps, denominator: 1 } })
  router.push(`/tmcut/editor?project=${project.id}`)
}

// ===== Filter / sort / view =====

type AspectFilter = 'all' | 'vertical' | 'horizontal' | 'square'
type SortKey = 'recent' | 'opened' | 'name' | 'duration'

const search = ref('')
const aspectFilter = ref<AspectFilter>('all')
const sortBy = ref<SortKey>('recent')
const viewMode = ref<'grid' | 'list'>('grid')

const aspectCounts = computed(() => {
  const counts = { vertical: 0, horizontal: 0, square: 0 }
  for (const project of projects.value) counts[aspectKey(project)]++
  return counts
})

const filterChips = computed(() => [
  { key: 'all' as const, label: t('tmcut.home.filterAll'), count: projects.value.length },
  { key: 'vertical' as const, label: t('tmcut.home.filterVertical'), count: aspectCounts.value.vertical },
  { key: 'horizontal' as const, label: t('tmcut.home.filterHorizontal'), count: aspectCounts.value.horizontal },
  { key: 'square' as const, label: t('tmcut.home.filterSquare'), count: aspectCounts.value.square }
])

const sortOptions = computed(() => [
  { label: t('tmcut.home.sortRecent'), value: 'recent' },
  { label: t('tmcut.home.sortOpened'), value: 'opened' },
  { label: t('tmcut.home.sortName'), value: 'name' },
  { label: t('tmcut.home.sortDuration'), value: 'duration' }
])

const filteredProjects = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = projects.value.filter((project) => {
    if (q && !(project.name || '').toLowerCase().includes(q)) return false
    if (aspectFilter.value !== 'all' && aspectKey(project) !== aspectFilter.value) return false
    return true
  })
  // Pinned projects ride on top in EVERY sort mode (roadmap J-2).
  const rank = (p: TmcutProject) => (p.pinned ? 0 : 1)
  const openedAt = (p: TmcutProject) =>
    new Date(p.lastOpenedAt || p.updated_at || p.created_at).getTime()
  list = [...list]
  if (sortBy.value === 'name') {
    list.sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || ''))
  } else if (sortBy.value === 'duration') {
    list.sort((a, b) => rank(a) - rank(b) || (b.durationMs || 0) - (a.durationMs || 0))
  } else if (sortBy.value === 'opened') {
    list.sort((a, b) => rank(a) - rank(b) || openedAt(b) - openedAt(a))
  } else {
    list.sort((a, b) => rank(a) - rank(b)
      || new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
  }
  return list
})

// ===== Card menu / rename / delete =====

const renameModalOpen = ref(false)
const renameTarget = ref<TmcutProject | null>(null)
const renameValue = ref('')
const deleteModalOpen = ref(false)
const deleteTarget = ref<TmcutProject | null>(null)

function openRename(project: TmcutProject) {
  renameTarget.value = project
  renameValue.value = project.name || ''
  renameModalOpen.value = true
}

function confirmRename() {
  if (renameTarget.value) {
    void renameProject(renameTarget.value.id, renameValue.value)
  }
  renameModalOpen.value = false
}

function openDelete(project: TmcutProject) {
  deleteTarget.value = project
  deleteModalOpen.value = true
}

function confirmDelete() {
  if (deleteTarget.value) {
    void deleteProject(deleteTarget.value.id)
  }
  deleteModalOpen.value = false
}

function handleDuplicate(project: TmcutProject) {
  duplicateProject(project.id, t('tmcut.home.dupSuffix'))
}

function cardMenuItems(project: TmcutProject) {
  return [
    { label: t('tmcut.home.menuOpen'), icon: 'i-lucide-rocket', onSelect: () => openProject(project.id) },
    {
      label: project.pinned ? t('tmcut.home.menuUnpin') : t('tmcut.home.menuPin'),
      icon: project.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin',
      onSelect: () => void togglePinProject(project.id)
    },
    { label: t('tmcut.home.menuRename'), icon: 'i-lucide-pencil', onSelect: () => openRename(project) },
    { label: t('tmcut.home.menuDuplicate'), icon: 'i-lucide-copy', onSelect: () => handleDuplicate(project) },
    { label: t('tmcut.home.menuDelete'), icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => openDelete(project) }
  ]
}

// ===== BasePage header actions =====

const headerActions = computed<HeaderAction[]>(() => [
  {
    key: 'new-project',
    icon: 'i-lucide-plus',
    label: t('tmcut.newProject'),
    color: 'primary',
    variant: 'solid',
    primary: true,
    onSelect: () => handleNewProject()
  },
  {
    key: 'templates',
    icon: 'i-lucide-layout-template',
    label: t('nav.tmcut_templates'),
    color: 'neutral',
    variant: 'soft',
    onSelect: () => router.push('/tmcut/templates')
  },
  {
    key: 'autocut',
    icon: 'i-lucide-scissors',
    label: t('nav.tmcut_autocut'),
    color: 'neutral',
    variant: 'soft',
    onSelect: () => router.push('/tmcut/autocut')
  }
])
</script>

<template>
  <BasePage id="tmcut-index" :title="t('nav.tmcut')" :description="t('tmcut.subtitle')">
    <template #right>
      <BaseHeaderActions :actions="headerActions" />
    </template>

    <div class="space-y-6">
      <!-- Hero deck + quick actions dock (design #1) -->
      <div class="relative overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 shadow-lg">
        <!-- Ambient glow decoration -->
        <div class="absolute -right-16 -top-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div class="absolute left-1/3 -bottom-20 w-56 h-56 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div class="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="inline-flex items-center justify-center w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span class="text-[11px] uppercase tracking-wider text-primary font-semibold">
                {{ t('tmcut.home.heroEyebrow') }}
              </span>
            </div>
            <h1 class="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {{ t('tmcut.home.heroTitle') }}
            </h1>
            <p class="text-sm text-neutral-500 mt-1 max-w-2xl">
              {{ t('tmcut.home.heroDesc') }}
            </p>
          </div>
          <UButton
            icon="i-lucide-plus"
            size="lg"
            color="primary"
            variant="solid"
            class="shrink-0"
            @click="handleNewProject"
          >
            {{ t('tmcut.newProject') }}
          </UButton>
        </div>

        <!-- Quick actions dock (real destinations only) -->
        <div class="relative z-10 mt-5 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
              {{ t('tmcut.home.quickTools') }}
            </span>
            <span class="text-[11px] font-mono text-neutral-400" :title="t('tmcut.workspace.hardwareStatus')">
              {{ hardwareLabel }}
            </span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            <!-- Import video → creates a project and opens the editor -->
            <button
              type="button"
              class="flex flex-col items-start p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:border-primary/50 transition text-left cursor-pointer group"
              @click="handleNewProject"
            >
              <div
                class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors"
              >
                <UIcon name="i-lucide-video" class="w-4 h-4" />
              </div>
              <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100 mt-2">
                {{ t('tmcut.home.actionImport') }}
              </span>
              <span class="text-[11px] text-neutral-500">{{ t('tmcut.home.actionImportDesc') }}</span>
            </button>

            <!-- Real canvas presets (same as /tmcut/templates) -->
            <button
              v-for="preset in quickPresets"
              :key="preset.id"
              type="button"
              class="flex flex-col items-start p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:border-primary/50 transition text-left cursor-pointer group"
              @click="applyQuickPreset(preset)"
            >
              <div
                class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors"
              >
                <UIcon :name="preset.icon" class="w-4 h-4" />
              </div>
              <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100 mt-2">
                {{ t(preset.nameKey) }}
              </span>
              <span class="text-[11px] text-neutral-500">{{ t(preset.descKey) }}</span>
            </button>

            <!-- AutoCut AI -->
            <button
              type="button"
              class="flex flex-col items-start p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:border-primary/50 transition text-left cursor-pointer group"
              @click="router.push('/tmcut/autocut')"
            >
              <div
                class="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary group-hover:bg-secondary group-hover:text-white transition-colors"
              >
                <UIcon name="i-lucide-sparkles" class="w-4 h-4" />
              </div>
              <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100 mt-2">
                {{ t('tmcut.shortcuts.autocutTitle') }}
              </span>
              <span class="text-[11px] text-neutral-500">{{ t('tmcut.shortcuts.autocutDesc') }}</span>
            </button>

            <!-- Template library -->
            <button
              type="button"
              class="flex flex-col items-start p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:border-primary/50 transition text-left cursor-pointer group"
              @click="router.push('/tmcut/templates')"
            >
              <div
                class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors"
              >
                <UIcon name="i-lucide-layout-template" class="w-4 h-4" />
              </div>
              <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100 mt-2">
                {{ t('nav.tmcut_templates') }}
              </span>
              <span class="text-[11px] text-neutral-500">{{ t('tmcut.templatesDesc') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Filter / search / sort / view bar -->
      <div class="flex flex-col md:flex-row items-center justify-between gap-3">
        <div class="relative w-full md:w-72">
          <UIcon
            name="i-lucide-search"
            class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            v-model="search"
            type="text"
            :placeholder="t('tmcut.home.searchPlaceholder')"
            class="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg pl-9 pr-3 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:border-primary/50 transition-colors"
          >
        </div>

        <div class="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          <button
            v-for="chip in filterChips"
            :key="chip.key"
            type="button"
            class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            :class="aspectFilter === chip.key
              ? 'bg-primary/15 text-primary border border-primary/40'
              : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'"
            @click="aspectFilter = chip.key"
          >
            {{ chip.label }} ({{ chip.count }})
          </button>
        </div>

        <div class="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
          <USelect
            v-model="sortBy"
            :items="sortOptions"
            size="sm"
            color="neutral"
            class="w-44"
          />
          <div class="flex items-center bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-0.5">
            <UButton
              icon="i-lucide-grid-2x2"
              size="xs"
              :variant="viewMode === 'grid' ? 'soft' : 'ghost'"
              :color="viewMode === 'grid' ? 'primary' : 'neutral'"
              :title="t('tmcut.home.viewGrid')"
              @click="viewMode = 'grid'"
            />
            <UButton
              icon="i-lucide-list"
              size="xs"
              :variant="viewMode === 'list' ? 'soft' : 'ghost'"
              :color="viewMode === 'list' ? 'primary' : 'neutral'"
              :title="t('tmcut.home.viewList')"
              @click="viewMode = 'list'"
            />
          </div>
        </div>
      </div>

      <!-- Recent projects -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {{ t('tmcut.recentProjects') }}
            </h2>
            <span class="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 font-mono text-[11px]">
              {{ filteredProjects.length }} files
            </span>
          </div>
        </div>

        <div
          v-if="projects.length === 0"
          class="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-12 text-center"
        >
          <UIcon name="i-lucide-film" class="w-12 h-12 text-neutral-400 mx-auto mb-3" />
          <h3 class="text-base font-medium text-neutral-900 dark:text-neutral-100">
            {{ t('tmcut.noProjects') }}
          </h3>
          <p class="text-sm text-neutral-500 max-w-sm mx-auto mt-1 mb-4">
            {{ t('tmcut.noProjectsDesc') }}
          </p>
          <UButton
            color="primary"
            variant="solid"
            icon="i-lucide-plus"
            @click="handleNewProject"
          >
            {{ t('tmcut.createFirstProject') }}
          </UButton>
        </div>

        <div
          v-else-if="filteredProjects.length === 0"
          class="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-8 text-center text-sm text-neutral-500"
        >
          {{ t('tmcut.home.noMatches') }}
        </div>

        <!-- Grid view -->
        <div
          v-else-if="viewMode === 'grid'"
          class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        >
          <div
            v-for="project in filteredProjects"
            :key="project.id"
            class="group border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden bg-white dark:bg-neutral-900 hover:border-primary/50 hover:-translate-y-0.5 transition cursor-pointer flex flex-col shadow-sm"
            @click="openProject(project.id)"
          >
            <!-- Thumbnail with badges -->
            <div
              class="aspect-video bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center relative overflow-hidden"
            >
              <img
                v-if="project.cover"
                :src="project.cover"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              >
              <UIcon v-else name="i-lucide-film" class="w-10 h-10 text-neutral-400" />

              <div class="absolute bottom-2 left-2 flex items-center gap-1">
                <span
                  class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/70 text-white backdrop-blur"
                >
                  {{ aspectLabel(project) }}
                </span>
                <span
                  v-if="resBadge(project)"
                  class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary text-neutral-900"
                >
                  {{ resBadge(project) }}
                </span>
              </div>
              <span
                v-if="fmtDuration(project)"
                class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/70 text-white backdrop-blur"
              >
                {{ fmtDuration(project) }}
              </span>
              <UIcon
                v-if="project.pinned"
                name="i-lucide-pin"
                class="absolute top-2 right-2 w-3.5 h-3.5 text-primary drop-shadow"
                :title="t('tmcut.home.pinnedTitle')"
              />

              <!-- Hover play overlay -->
              <div
                class="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <div
                  class="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg"
                >
                  <UIcon name="i-lucide-play" class="w-5 h-5" />
                </div>
              </div>
            </div>

            <!-- Info -->
            <div class="p-3 flex-1 flex flex-col justify-between">
              <div class="flex items-start justify-between gap-1">
                <h4 class="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate flex-1">
                  {{ project.name }}
                </h4>
                <UDropdownMenu :items="cardMenuItems(project)" :content="{ side: 'bottom', align: 'end' }">
                  <UButton
                    icon="i-lucide-ellipsis-vertical"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :title="t('tmcut.home.menuOpen')"
                    @click.stop
                  />
                </UDropdownMenu>
              </div>
              <p class="text-[11px] text-neutral-500 mt-1 flex items-center gap-1.5">
                <span class="truncate">{{ editedLabel(project) }}</span>
              </p>
              <p v-if="project.canvas?.fps" class="text-[10px] font-mono text-neutral-400 mt-0.5">
                {{ canvasFpsValue(project.canvas) }} FPS · {{ project.canvas.width }}x{{ project.canvas.height }}
              </p>
            </div>
          </div>
        </div>

        <!-- List view -->
        <div v-else class="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
          <div
            v-for="project in filteredProjects"
            :key="project.id"
            class="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-950 transition cursor-pointer"
            @click="openProject(project.id)"
          >
            <UIcon name="i-lucide-film" class="w-4 h-4 text-neutral-400 shrink-0" />
            <UIcon
              v-if="project.pinned"
              name="i-lucide-pin"
              class="w-4 h-4 text-primary shrink-0"
              :title="t('tmcut.home.pinnedTitle')"
            />
            <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate flex-1">
              {{ project.name }}
            </span>
            <span
              class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-500 shrink-0"
            >
              {{ aspectLabel(project) }}
            </span>
            <span
              v-if="fmtDuration(project)"
              class="text-[11px] font-mono text-neutral-400 w-14 text-right shrink-0"
            >
              {{ fmtDuration(project) }}
            </span>
            <span class="text-[11px] text-neutral-500 w-40 text-right shrink-0 hidden md:block">
              {{ editedLabel(project) }}
            </span>
            <UDropdownMenu :items="cardMenuItems(project)" :content="{ side: 'bottom', align: 'end' }">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                size="xs"
                variant="ghost"
                color="neutral"
                @click.stop
              />
            </UDropdownMenu>
          </div>
        </div>
      </div>

      <!-- Template presets strip (real presets, links to the library) -->
      <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <div>
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-flame" class="w-4 h-4 text-primary" />
              <h2 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {{ t('tmcut.presetSizes') }}
              </h2>
            </div>
            <p class="text-xs text-neutral-500 mt-0.5">
              {{ t('tmcut.templatesDesc') }}
            </p>
          </div>
          <UButton
            to="/tmcut/templates"
            icon="i-lucide-chevron-right"
            size="xs"
            variant="ghost"
            color="primary"
            :label="t('tmcut.home.templatesLink')"
            trailing
          />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            v-for="preset in templatePresets"
            :key="preset.id"
            type="button"
            class="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-primary/50 transition text-left cursor-pointer group"
            @click="applyTemplatePreset(preset)"
          >
            <div
              class="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors"
            >
              <UIcon :name="preset.icon" class="w-5 h-5" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                {{ preset.name }}
              </p>
              <p class="text-[11px] font-mono text-neutral-400">
                {{ preset.canvas }} ({{ preset.fps }}fps)
              </p>
            </div>
            <UButton
              size="xs"
              color="primary"
              variant="soft"
              :label="t('tmcut.apply')"
            />
          </button>
        </div>
      </div>

      <!-- Rename modal -->
      <UModal v-model:open="renameModalOpen" :title="t('tmcut.home.renameTitle')">
        <template #body>
          <UInput
            v-model="renameValue"
            :placeholder="renameTarget?.name"
            size="lg"
            class="w-full"
            @keyup.enter="confirmRename"
          />
        </template>
        <template #footer>
          <div class="flex items-center justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="soft"
              :label="t('global.cancel')"
              @click="renameModalOpen = false"
            />
            <UButton
              color="primary"
              variant="solid"
              :label="t('global.save')"
              @click="confirmRename"
            />
          </div>
        </template>
      </UModal>

      <!-- Delete confirm modal -->
      <UModal v-model:open="deleteModalOpen" :title="t('tmcut.home.deleteTitle')">
        <template #body>
          <p class="text-sm text-neutral-500">
            {{ t('tmcut.home.deleteDesc', { name: deleteTarget?.name || '' }) }}
          </p>
        </template>
        <template #footer>
          <div class="flex items-center justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="soft"
              :label="t('global.cancel')"
              @click="deleteModalOpen = false"
            />
            <UButton
              color="error"
              variant="soft"
              :label="t('tmcut.home.deleteConfirm')"
              @click="confirmDelete"
            />
          </div>
        </template>
      </UModal>
    </div>
  </BasePage>
</template>
