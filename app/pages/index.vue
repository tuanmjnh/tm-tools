<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useHubAi } from '~/composables/useHubAi'
import type { HubAiProviderItem } from '~/composables/useHubAi'

const { t } = useI18n()
const router = useRouter()
const { appId } = useHub()
const { listProviders } = useHubAi()
const { profiles, total: totalProfiles, fetchProfiles } = useProfiles()
const { proxies, fetchProxies } = useProfileProxies()
const { linkHistory } = useMediaStore()

const aiProviders = ref<HubAiProviderItem[]>([])
const aiLoading = ref(false)

onMounted(async () => {
  await Promise.allSettled([
    fetchProfiles(),
    fetchProxies(),
    loadAiProviders()
  ])
})

async function loadAiProviders() {
  aiLoading.value = true
  try {
    aiProviders.value = await listProviders(appId)
  } catch {
    // Hub unreachable: the dashboard keeps its local counters.
  } finally {
    aiLoading.value = false
  }
}

const connectedAiProviders = computed(() => aiProviders.value.filter(p => p.connections.length > 0))
const aiConnectionCount = computed(() => aiProviders.value.reduce((sum, p) => sum + p.connections.length, 0))

const topAiProviders = computed(() =>
  [...connectedAiProviders.value]
    .sort((a, b) => b.connections.length - a.connections.length)
    .slice(0, 5)
)

const moreActions = computed(() => [
  [
    {
      label: t('nav.profiles_list'),
      icon: 'i-lucide-id-card',
      onSelect: () => router.push('/profiles')
    },
    {
      label: t('nav.profile_proxies'),
      icon: 'i-lucide-globe',
      onSelect: () => router.push('/profiles/proxies')
    },
    {
      label: t('nav.connections'),
      icon: 'i-lucide-cable',
      onSelect: () => router.push('/resources/connections')
    }
  ],
  [
    {
      label: t('nav.ai_keys'),
      icon: 'i-lucide-key',
      onSelect: () => router.push('/system/ai-keys')
    },
    {
      label: t('dashboard.actions.openChat'),
      icon: 'i-lucide-bot',
      onSelect: () => router.push('/chat')
    },
    {
      label: t('nav.utilities'),
      icon: 'i-lucide-wrench',
      onSelect: () => router.push('/utilities')
    }
  ]
])
</script>

<template>
  <BasePage id="home" :title="t('dashboard.title')" :description="t('dashboard.description')">
    <template #right>
      <UButton
        to="/tools/download"
        icon="i-lucide-download"
        color="primary"
        variant="solid"
        size="sm"
      >
        <span class="hidden sm:inline">{{ t('dashboard.actions.openDownloader') }}</span>
      </UButton>
      <UButton
        to="/tools/video"
        icon="i-lucide-film"
        color="neutral"
        variant="soft"
        size="sm"
      >
        <span class="hidden md:inline">{{ t('dashboard.actions.videoTools') }}</span>
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

        <div
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-900 flex items-center justify-between shadow-xs transition hover:border-amber-500/40"
        >
          <div class="space-y-1">
            <span class="text-xs font-medium text-neutral-500">{{ t('dashboard.stats.aiConnections') }}</span>
            <div class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {{ aiLoading ? '—' : aiConnectionCount }}
            </div>
            <UButton
              to="/system/ai-keys"
              size="xs"
              variant="soft"
              color="neutral"
              class="mt-1"
            >
              {{ t('nav.ai_keys') }}
            </UButton>
          </div>
          <div class="size-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-brain" class="size-6" />
          </div>
        </div>

        <div
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-900 flex items-center justify-between shadow-xs transition hover:border-emerald-500/40"
        >
          <div class="space-y-1">
            <span class="text-xs font-medium text-neutral-500">{{ t('dashboard.stats.media') }}</span>
            <div class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {{ linkHistory.length }}
            </div>
            <UButton
              to="/resources/media"
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
            icon="i-lucide-arrow-down-to-line"
            size="xs"
            color="primary"
            variant="soft"
            to="/tools/download"
          >
            {{ t('dashboard.actions.openDownloader') }}
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
            icon="i-lucide-id-card"
            size="xs"
            color="neutral"
            variant="soft"
            to="/profiles"
          >
            {{ t('nav.profiles_list') }}
          </UButton>
          <UButton
            icon="i-lucide-key"
            size="xs"
            color="neutral"
            variant="soft"
            to="/system/ai-keys"
          >
            {{ t('nav.ai_keys') }}
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

      <!-- Core Modules Grid (3 modules) -->
      <div class="space-y-4">
        <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {{ t('dashboard.coreModules') }}
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <!-- Module 1: Tools -->
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
                    Convert, Join, Split, Image2Video, Audio
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

          <!-- Module 2: Anti-Detect Profiles & Proxies -->
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

          <!-- Module 3: AI Control Plane & Utilities -->
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

              <div class="grid grid-cols-2 gap-2 pt-2">
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800/50 hover:border-amber-500/50 cursor-pointer transition"
                  @click="router.push('/system/ai-keys')"
                >
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-key" class="size-4 text-amber-500" />
                    <span class="text-xs font-medium text-neutral-900 dark:text-neutral-200">{{ t('nav.ai_keys') }}</span>
                  </div>
                  <p class="text-[10px] text-neutral-500 mt-1">
                    Providers, models, credentials
                  </p>
                </div>
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800/50 hover:border-amber-500/50 cursor-pointer transition"
                  @click="router.push('/resources/connections')"
                >
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-cable" class="size-4 text-amber-500" />
                    <span class="text-xs font-medium text-neutral-900 dark:text-neutral-200">{{ t('nav.connections') }}</span>
                  </div>
                  <p class="text-[10px] text-neutral-500 mt-1">
                    Shared hub credentials
                  </p>
                </div>
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800/50 hover:border-amber-500/50 cursor-pointer transition"
                  @click="router.push('/chat')"
                >
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-bot" class="size-4 text-amber-500" />
                    <span class="text-xs font-medium text-neutral-900 dark:text-neutral-200">AI Chat</span>
                  </div>
                  <p class="text-[10px] text-neutral-500 mt-1">
                    Hub-routed assistant
                  </p>
                </div>
                <div
                  class="border border-neutral-100 dark:border-neutral-800 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800/50 hover:border-amber-500/50 cursor-pointer transition"
                  @click="router.push('/utilities')"
                >
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-wrench" class="size-4 text-amber-500" />
                    <span class="text-xs font-medium text-neutral-900 dark:text-neutral-200">{{ t('nav.utilities') }}</span>
                  </div>
                  <p class="text-[10px] text-neutral-500 mt-1">
                    Text, icons, encode, random
                  </p>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 mt-5 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <UButton
                to="/system/ai-keys"
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-key"
              >
                {{ t('nav.ai_keys') }}
              </UButton>
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
            </div>
          </div>
        </div>
      </div>

      <!-- AI Providers & System Status -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {{ t('dashboard.aiProviders') }}
            </h3>
            <UButton
              to="/system/ai-keys"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-arrow-right"
            >
              {{ t('nav.ai_keys') }}
            </UButton>
          </div>

          <div
            v-if="!aiLoading && topAiProviders.length === 0"
            class="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-8 text-center bg-white dark:bg-neutral-900"
          >
            <UIcon name="i-lucide-brain-circuit" class="size-10 text-neutral-400 mx-auto mb-2" />
            <p class="text-sm font-medium text-neutral-900 dark:text-neutral-200">
              {{ t('dashboard.noAiProviders') }}
            </p>
            <p class="text-xs text-neutral-500 mt-1 mb-4">
              {{ t('dashboard.noAiProvidersDesc') }}
            </p>
            <UButton
              color="primary"
              variant="soft"
              icon="i-lucide-plus"
              to="/system/ai-keys"
            >
              {{ t('aiProviders.connect_provider') }}
            </UButton>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              v-for="provider in topAiProviders"
              :key="provider.definition.id"
              class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-3.5 bg-white dark:bg-neutral-900 hover:border-amber-500/50 transition cursor-pointer flex items-center gap-3 group"
              @click="router.push('/system/ai-keys')"
            >
              <div class="size-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-brain" class="size-4" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate group-hover:text-amber-600 transition-colors">
                  {{ provider.definition.name }}
                </h4>
                <p class="text-[11px] text-neutral-500 truncate">
                  {{ provider.definition.key }}
                </p>
              </div>
              <UBadge color="neutral" variant="subtle" size="xs">
                {{ provider.connections.length }}
              </UBadge>
            </div>
          </div>
        </div>

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
