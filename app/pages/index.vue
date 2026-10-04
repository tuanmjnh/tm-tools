<script setup lang="ts">
import { computed, onMounted } from 'vue'

const { t } = useI18n()
const router = useRouter()
const { projects, createProject } = useTmcutProject()
const { profiles, total: totalProfiles, fetchProfiles } = useProfiles()
const { proxies, fetchProxies } = useProfileProxies()
const { linkHistory } = useMediaStore()

onMounted(async () => {
  await Promise.allSettled([
    fetchProfiles(),
    fetchProxies()
  ])
})

function handleCreateProject() {
  const proj = createProject(t('tmcut.newProject'))
  router.push(`/tmcut/editor?project=${proj.id}`)
}

const recentProjects = computed(() => {
  return [...projects.value]
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
    .slice(0, 4)
})

const moreActions = computed(() => [
  [
    {
      label: t('dashboard.actions.autocut'),
      icon: 'i-lucide-scissors',
      onSelect: () => router.push('/tmcut/autocut')
    },
    {
      label: t('dashboard.actions.templates'),
      icon: 'i-lucide-layout-template',
      onSelect: () => router.push('/tmcut/templates')
    },
    {
      label: t('dashboard.actions.videoTools'),
      icon: 'i-lucide-film',
      onSelect: () => router.push('/tools/video')
    }
  ],
  [
    {
      label: t('dashboard.actions.manageProfiles'),
      icon: 'i-lucide-id-card',
      onSelect: () => router.push('/profiles')
    },
    {
      label: t('dashboard.actions.manageProxies'),
      icon: 'i-lucide-globe',
      onSelect: () => router.push('/profiles/proxies')
    },
    {
      label: t('dashboard.actions.openChat'),
      icon: 'i-lucide-bot',
      onSelect: () => router.push('/chat')
    },
    {
      label: t('dashboard.actions.textTools'),
      icon: 'i-lucide-type',
      onSelect: () => router.push('/utilities/text')
    }
  ]
])
</script>

<template>
  <BasePage id="home" :title="t('dashboard.title')" :description="t('dashboard.description')">
    <template #right>
      <UButton
        icon="i-lucide-plus"
        color="primary"
        variant="solid"
        size="sm"
        @click="handleCreateProject"
      >
        <span class="hidden sm:inline">{{ t('tmcut.newProject') }}</span>
      </UButton>
      <UButton
        to="/tools/download"
        icon="i-lucide-download"
        color="neutral"
        variant="soft"
        size="sm"
      >
        <span class="hidden sm:inline">{{ t('dashboard.actions.openDownloader') }}</span>
      </UButton>
      <UButton
        to="/chat"
        icon="i-lucide-bot"
        color="neutral"
        variant="soft"
        size="sm"
      >
        <span class="hidden md:inline">{{ t('dashboard.actions.openChat') }}</span>
      </UButton>
      <UDropdownMenu :items="moreActions" :content="{ side: 'bottom', align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis-vertical"
          color="neutral"
          variant="soft"
          size="sm"
          :aria-label="t('common.more')"
        />
      </UDropdownMenu>
    </template>

    <div class="space-y-6">
      <!-- Quick Stats KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Card 1: TMCut Projects -->
        <div
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-900 flex items-center justify-between shadow-xs transition hover:border-primary/40"
        >
          <div class="space-y-1">
            <span class="text-xs font-medium text-neutral-500">{{ t('dashboard.stats.projects') }}</span>
            <div class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {{ projects.length }}
            </div>
            <UButton
              to="/tmcut"
              size="xs"
              variant="soft"
              color="primary"
              class="mt-1"
            >
              {{ t('nav.tmcut') }}
            </UButton>
          </div>
          <div class="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-clapperboard" class="size-6" />
          </div>
        </div>

        <!-- Card 2: Anti-Detect Profiles -->
        <div
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-900 flex items-center justify-between shadow-xs transition hover:border-sky-500/40"
        >
          <div class="space-y-1">
            <span class="text-xs font-medium text-neutral-500">{{ t('dashboard.stats.profiles') }}</span>
            <div class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {{ totalProfiles || profiles.length }}
            </div>
            <UButton
              to="/profiles"
              size="xs"
              variant="soft"
              color="neutral"
              class="mt-1"
            >
              {{ t('dashboard.actions.manageProfiles') }}
            </UButton>
          </div>
          <div class="size-12 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-id-card" class="size-6" />
          </div>
        </div>

        <!-- Card 3: Proxies Pool -->
        <div
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-900 flex items-center justify-between shadow-xs transition hover:border-indigo-500/40"
        >
          <div class="space-y-1">
            <span class="text-xs font-medium text-neutral-500">{{ t('dashboard.stats.proxies') }}</span>
            <div class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {{ proxies.length }}
            </div>
            <UButton
              to="/profiles/proxies"
              size="xs"
              variant="soft"
              color="neutral"
              class="mt-1"
            >
              {{ t('dashboard.actions.manageProxies') }}
            </UButton>
          </div>
          <div class="size-12 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-globe" class="size-6" />
          </div>
        </div>

        <!-- Card 4: Media Assets -->
        <div
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-900 flex items-center justify-between shadow-xs transition hover:border-emerald-500/40"
        >
          <div class="space-y-1">
            <span class="text-xs font-medium text-neutral-500">{{ t('dashboard.stats.media') }}</span>
            <div class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {{ linkHistory.length }}
            </div>
            <UButton
              to="/media"
              size="xs"
              variant="soft"
              color="neutral"
              class="mt-1"
            >
              {{ t('dashboard.actions.openMedia') }}
            </UButton>
          </div>
          <div class="size-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-images" class="size-6" />
          </div>
        </div>
      </div>

      <!-- Quick Shortcuts Action Bar -->
      <div class="p-4 rounded-2xl bg-neutral-900/5 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-sparkles" class="size-5 text-primary shrink-0" />
          <span class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{{ t('dashboard.quickActions') }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            icon="i-lucide-scissors"
            size="xs"
            color="primary"
            variant="soft"
            to="/tmcut/autocut"
          >
            {{ t('dashboard.actions.autocut') }}
          </UButton>
          <UButton
            icon="i-lucide-film"
            size="xs"
            color="neutral"
            variant="soft"
            to="/tools/video"
          >
            {{ t('dashboard.actions.videoTools') }}
          </UButton>
          <UButton
            icon="i-lucide-arrow-down-to-line"
            size="xs"
            color="neutral"
            variant="soft"
            to="/tools/download"
          >
            {{ t('dashboard.actions.openDownloader') }}
          </UButton>
          <UButton
            icon="i-lucide-bot"
            size="xs"
            color="neutral"
            variant="soft"
            to="/chat"
          >
            {{ t('dashboard.actions.openChat') }}
          </UButton>
          <UButton
            icon="i-lucide-folder-cog"
            size="xs"
            color="neutral"
            variant="soft"
            to="/utilities"
          >
            {{ t('nav.utilities') }}
          </UButton>
        </div>
      </div>

      <!-- Core Modules Grid (4 modules) -->
      <div class="space-y-4">
        <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {{ t('dashboard.coreModules') }}
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Module 1: TMCut Video Studio -->
          <div
            class="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 bg-white dark:bg-neutral-900/90 flex flex-col justify-between shadow-xs hover:border-primary/40 transition"
          >
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <div class="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-clapperboard" class="size-5" />
                </div>
                <div>
                  <h3 class="font-semibold text-base text-neutral-900 dark:text-neutral-100">
                    {{ t('dashboard.modules.tmcutTitle') }}
                  </h3>
                  <p class="text-xs text-neutral-500">
                    {{ t('dashboard.modules.tmcutDesc') }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-2 pt-2">
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-2.5 bg-neutral-50 dark:bg-neutral-800/50 hover:border-primary/50 cursor-pointer transition text-center"
                  @click="handleCreateProject"
                >
                  <UIcon name="i-lucide-smartphone" class="size-4 text-primary mx-auto mb-1" />
                  <p class="text-xs font-medium text-neutral-900 dark:text-neutral-200">
                    TikTok 9:16
                  </p>
                  <p class="text-[10px] text-neutral-400">
                    1080x1920
                  </p>
                </div>
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-2.5 bg-neutral-50 dark:bg-neutral-800/50 hover:border-primary/50 cursor-pointer transition text-center"
                  @click="handleCreateProject"
                >
                  <UIcon name="i-lucide-monitor" class="size-4 text-primary mx-auto mb-1" />
                  <p class="text-xs font-medium text-neutral-900 dark:text-neutral-200">
                    YouTube 16:9
                  </p>
                  <p class="text-[10px] text-neutral-400">
                    1920x1080
                  </p>
                </div>
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-2.5 bg-neutral-50 dark:bg-neutral-800/50 hover:border-primary/50 cursor-pointer transition text-center"
                  @click="router.push('/tmcut/autocut')"
                >
                  <UIcon name="i-lucide-scissors" class="size-4 text-primary mx-auto mb-1" />
                  <p class="text-xs font-medium text-neutral-900 dark:text-neutral-200">
                    AutoCut AI
                  </p>
                  <p class="text-[10px] text-neutral-400">
                    Highlights
                  </p>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 mt-5 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <UButton
                to="/tmcut"
                size="sm"
                color="primary"
                variant="soft"
                icon="i-lucide-clapperboard"
              >
                {{ t('dashboard.actions.openEditor') }}
              </UButton>
              <UButton
                to="/tmcut/templates"
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-layout-template"
              >
                {{ t('dashboard.actions.templates') }}
              </UButton>
              <UButton
                to="/tmcut/autocut"
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-scissors"
              >
                {{ t('dashboard.actions.autocut') }}
              </UButton>
            </div>
          </div>

          <!-- Module 2: Tools (Downloader & Video Processor) -->
          <div
            class="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 bg-white dark:bg-neutral-900/90 flex flex-col justify-between shadow-xs hover:border-rose-500/40 transition"
          >
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <div class="size-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-film" class="size-5" />
                </div>
                <div>
                  <h3 class="font-semibold text-base text-neutral-900 dark:text-neutral-100">
                    {{ t('dashboard.modules.toolsTitle') }}
                  </h3>
                  <p class="text-xs text-neutral-500">
                    {{ t('dashboard.modules.toolsDesc') }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 pt-2">
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800/50 hover:border-rose-500/50 cursor-pointer transition"
                  @click="router.push('/tools/download')"
                >
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-arrow-down-to-line" class="size-4 text-rose-500" />
                    <span class="text-xs font-medium text-neutral-900 dark:text-neutral-200">{{ t('nav.download') }}</span>
                  </div>
                  <p class="text-[10px] text-neutral-500 mt-1">
                    YouTube, TikTok, HLS M3U8, Playlists
                  </p>
                </div>
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800/50 hover:border-rose-500/50 cursor-pointer transition"
                  @click="router.push('/tools/video')"
                >
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-file-cog" class="size-4 text-rose-500" />
                    <span class="text-xs font-medium text-neutral-900 dark:text-neutral-200">{{ t('nav.video') }}</span>
                  </div>
                  <p class="text-[10px] text-neutral-500 mt-1">
                    Render, Join, Split, Image2Video, Audio
                  </p>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 mt-5 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <UButton
                to="/tools/download"
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-download"
              >
                {{ t('dashboard.actions.openDownloader') }}
              </UButton>
              <UButton
                to="/tools/video"
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-film"
              >
                {{ t('dashboard.actions.videoTools') }}
              </UButton>
            </div>
          </div>

          <!-- Module 3: Anti-Detect Profiles & Proxies -->
          <div
            class="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 bg-white dark:bg-neutral-900/90 flex flex-col justify-between shadow-xs hover:border-sky-500/40 transition"
          >
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <div class="size-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-fingerprint" class="size-5" />
                </div>
                <div>
                  <h3 class="font-semibold text-base text-neutral-900 dark:text-neutral-100">
                    {{ t('dashboard.modules.profilesTitle') }}
                  </h3>
                  <p class="text-xs text-neutral-500">
                    {{ t('dashboard.modules.profilesDesc') }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 pt-2">
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800/50 hover:border-sky-500/50 cursor-pointer transition"
                  @click="router.push('/profiles')"
                >
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-id-card" class="size-4 text-sky-500" />
                    <span class="text-xs font-medium text-neutral-900 dark:text-neutral-200">{{ t('nav.profiles_list') }}</span>
                  </div>
                  <p class="text-[10px] text-neutral-500 mt-1">
                    Chromium, Firefox, Camoufox, Fingerprint
                  </p>
                </div>
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800/50 hover:border-sky-500/50 cursor-pointer transition"
                  @click="router.push('/profiles/proxies')"
                >
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-globe" class="size-4 text-sky-500" />
                    <span class="text-xs font-medium text-neutral-900 dark:text-neutral-200">{{ t('nav.profile_proxies') }}</span>
                  </div>
                  <p class="text-[10px] text-neutral-500 mt-1">
                    HTTP, SOCKS5, Geo & Latency Check
                  </p>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 mt-5 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <UButton
                to="/profiles"
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-id-card"
              >
                {{ t('dashboard.actions.manageProfiles') }}
              </UButton>
              <UButton
                to="/profiles/proxies"
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-globe"
              >
                {{ t('dashboard.actions.manageProxies') }}
              </UButton>
            </div>
          </div>

          <!-- Module 4: AI Assistant & Utilities -->
          <div
            class="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 bg-white dark:bg-neutral-900/90 flex flex-col justify-between shadow-xs hover:border-amber-500/40 transition"
          >
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <div class="size-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-sparkles" class="size-5" />
                </div>
                <div>
                  <h3 class="font-semibold text-base text-neutral-900 dark:text-neutral-100">
                    {{ t('dashboard.modules.utilitiesTitle') }}
                  </h3>
                  <p class="text-xs text-neutral-500">
                    {{ t('dashboard.modules.utilitiesDesc') }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-2 pt-2">
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-2.5 bg-neutral-50 dark:bg-neutral-800/50 hover:border-amber-500/50 cursor-pointer transition text-center"
                  @click="router.push('/chat')"
                >
                  <UIcon name="i-lucide-bot" class="size-4 text-amber-500 mx-auto mb-1" />
                  <span class="text-xs font-medium text-neutral-900 dark:text-neutral-200">AI Chat</span>
                </div>
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-2.5 bg-neutral-50 dark:bg-neutral-800/50 hover:border-amber-500/50 cursor-pointer transition text-center"
                  @click="router.push('/utilities/icons')"
                >
                  <UIcon name="i-lucide-shapes" class="size-4 text-amber-500 mx-auto mb-1" />
                  <span class="text-xs font-medium text-neutral-900 dark:text-neutral-200">Icons</span>
                </div>
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-2.5 bg-neutral-50 dark:bg-neutral-800/50 hover:border-amber-500/50 cursor-pointer transition text-center"
                  @click="router.push('/utilities/encode')"
                >
                  <UIcon name="i-lucide-binary" class="size-4 text-amber-500 mx-auto mb-1" />
                  <span class="text-xs font-medium text-neutral-900 dark:text-neutral-200">Encode</span>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 mt-5 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <UButton
                to="/chat"
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-bot"
              >
                {{ t('dashboard.actions.openChat') }}
              </UButton>
              <UButton
                to="/utilities"
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-folder-cog"
              >
                {{ t('nav.utilities') }}
              </UButton>
              <UButton
                to="/media"
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-images"
              >
                {{ t('dashboard.actions.openMedia') }}
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Projects & System Status -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Recent Projects (2 Cols) -->
        <div class="lg:col-span-2 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {{ t('dashboard.recentProjects') }}
            </h3>
            <UButton
              to="/tmcut"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-arrow-right"
            >
              {{ t('global.showingCount', { count: recentProjects.length, total: projects.length }) }}
            </UButton>
          </div>

          <div
            v-if="recentProjects.length === 0"
            class="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-8 text-center bg-white dark:bg-neutral-900"
          >
            <UIcon name="i-lucide-film" class="size-10 text-neutral-400 mx-auto mb-2" />
            <p class="text-sm font-medium text-neutral-900 dark:text-neutral-200">
              {{ t('tmcut.noProjects') }}
            </p>
            <p class="text-xs text-neutral-500 mt-1 mb-4">
              {{ t('tmcut.noProjectsDesc') }}
            </p>
            <UButton
              color="primary"
              variant="soft"
              icon="i-lucide-plus"
              @click="handleCreateProject"
            >
              {{ t('tmcut.createFirstProject') }}
            </UButton>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              v-for="project in recentProjects"
              :key="project.id"
              class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 bg-white dark:bg-neutral-900 hover:border-primary/50 transition cursor-pointer flex gap-3 group"
              @click="router.push(`/tmcut/editor?project=${project.id}`)"
            >
              <div
                class="w-24 h-16 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 relative overflow-hidden"
              >
                <img v-if="project.cover" :src="project.cover" class="w-full h-full object-cover">
                <UIcon v-else name="i-lucide-clapperboard" class="size-6 text-neutral-400 group-hover:text-primary transition-colors" />
              </div>
              <div class="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <h4 class="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate group-hover:text-primary transition-colors">
                    {{ project.name }}
                  </h4>
                  <p class="text-[11px] text-neutral-500 font-mono">
                    {{ project.canvas?.width }}x{{ project.canvas?.height }} ({{ project.canvas?.fps }}fps)
                  </p>
                </div>
                <div class="flex items-center justify-between text-[11px] text-neutral-400">
                  <span>{{ new Date(project.updated_at || project.created_at).toLocaleDateString() }}</span>
                  <UIcon name="i-lucide-external-link" class="size-3.5 text-neutral-400 group-hover:text-primary transition-colors" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- System & Engine Status (1 Col) -->
        <div class="space-y-4">
          <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {{ t('dashboard.systemStatus') }}
          </h3>

          <div
            class="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 bg-white dark:bg-neutral-900 divide-y divide-neutral-100 dark:divide-neutral-800 space-y-3"
          >
            <div class="flex items-start gap-3 pb-3">
              <UIcon name="i-lucide-cpu" class="size-5 text-emerald-500 shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  {{ t('dashboard.system.desktopEngine') }}
                </p>
                <p class="text-[11px] text-neutral-500">
                  {{ t('dashboard.system.desktopDesc') }}
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3 pt-3 pb-3">
              <UIcon name="i-lucide-film" class="size-5 text-primary shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  {{ t('dashboard.system.ffmpegEngine') }}
                </p>
                <p class="text-[11px] text-neutral-500">
                  {{ t('dashboard.system.ffmpegDesc') }}
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3 pt-3 pb-3">
              <UIcon name="i-lucide-hard-drive" class="size-5 text-sky-500 shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  {{ t('dashboard.system.mediaStorage') }}
                </p>
                <p class="text-[11px] text-neutral-500">
                  {{ t('dashboard.system.mediaDesc') }}
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3 pt-3">
              <UIcon name="i-lucide-shield-check" class="size-5 text-indigo-500 shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  {{ t('dashboard.system.authProvider') }}
                </p>
                <p class="text-[11px] text-neutral-500">
                  {{ t('dashboard.system.authDesc') }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </BasePage>
</template>
