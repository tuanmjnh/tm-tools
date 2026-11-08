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
const { library, refreshLibrary } = usePdfStudio()

const aiProviders = ref<HubAiProviderItem[]>([])
const aiLoading = ref(false)

onMounted(async () => {
  await Promise.allSettled([
    fetchProfiles(),
    fetchProxies(),
    loadAiProviders(),
    refreshLibrary()
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
      onSelect: () => router.push('/browser-hub')
    },
    {
      label: t('nav.profile_proxies'),
      icon: 'i-lucide-globe',
      onSelect: () => router.push('/browser-hub/proxies')
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
      <UButton to="/media/download" icon="i-lucide-download" color="primary" variant="soft" size="sm">
        <span class="hidden sm:inline">{{ t('dashboard.actions.openDownloader') }}</span>
      </UButton>
      <UButton to="/media/video" icon="i-lucide-film" color="secondary" variant="soft" size="sm">
        <span class="hidden md:inline">{{ t('dashboard.actions.videoTools') }}</span>
      </UButton>
      <UDropdownMenu :items="moreActions" :content="{ side: 'bottom', align: 'end' }">
        <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="soft" size="sm"
          :aria-label="t('common.more')" />
      </UDropdownMenu>
    </template>

    <div class="relative">
      <div class="tm-iso-region" aria-hidden="true">
        <div class="tm-iso-grid" />
      </div>

      <BaseBentoGrid>
        <!-- KPI tiles -->
        <BaseBentoCard :span="3" :span-sm="3">
          <div class="flex h-full items-start justify-between gap-3 p-3.5">
            <div class="flex min-w-0 flex-col">
              <p class="stat-label">{{ t('dashboard.stats.profiles') }}</p>
              <p class="stat-value">{{ totalProfiles || profiles.length }}</p>
              <UButton to="/browser-hub" size="xs" variant="soft" color="neutral" class="mt-auto w-fit">
                {{ t('dashboard.actions.manageProfiles') }}
              </UButton>
            </div>
            <span class="stat-icon">
              <UIcon name="i-lucide-id-card" class="size-4" />
            </span>
          </div>
        </BaseBentoCard>

        <BaseBentoCard :span="3" :span-sm="3">
          <div class="flex h-full items-start justify-between gap-3 p-3.5">
            <div class="flex min-w-0 flex-col">
              <p class="stat-label">{{ t('dashboard.stats.proxies') }}</p>
              <p class="stat-value">{{ proxies.length }}</p>
              <UButton to="/browser-hub/proxies" size="xs" variant="soft" color="neutral" class="mt-auto w-fit">
                {{ t('dashboard.actions.manageProxies') }}
              </UButton>
            </div>
            <span class="stat-icon">
              <UIcon name="i-lucide-globe" class="size-4" />
            </span>
          </div>
        </BaseBentoCard>

        <BaseBentoCard :span="3" :span-sm="3">
          <div class="flex h-full items-start justify-between gap-3 p-3.5">
            <div class="flex min-w-0 flex-col">
              <p class="stat-label">{{ t('dashboard.stats.aiConnections') }}</p>
              <p class="stat-value">{{ aiLoading ? '—' : aiConnectionCount }}</p>
              <UButton to="/system/ai-keys" size="xs" variant="soft" color="neutral" class="mt-auto w-fit">
                {{ t('nav.ai_keys') }}
              </UButton>
            </div>
            <span class="stat-icon">
              <UIcon name="i-lucide-brain" class="size-4" />
            </span>
          </div>
        </BaseBentoCard>

        <BaseBentoCard :span="3" :span-sm="3">
          <div class="flex h-full items-start justify-between gap-3 p-3.5">
            <div class="flex min-w-0 flex-col">
              <p class="stat-label">{{ t('dashboard.stats.media') }}</p>
              <p class="stat-value">{{ linkHistory.length }}</p>
              <UButton to="/resources/media" size="xs" variant="soft" color="neutral" class="mt-auto w-fit">
                {{ t('dashboard.actions.openMedia') }}
              </UButton>
            </div>
            <span class="stat-icon">
              <UIcon name="i-lucide-images" class="size-4" />
            </span>
          </div>
        </BaseBentoCard>

        <!-- Quick actions -->
        <BaseBentoCard :span="12" :span-sm="6" :title="t('dashboard.quickActions')" icon="i-lucide-sparkles">
          <div class="flex flex-wrap items-center gap-2 pb-0.5">
            <UButton icon="i-lucide-arrow-down-to-line" size="xs" color="primary" variant="soft" to="/media/download">
              {{ t('dashboard.actions.openDownloader') }}
            </UButton>
            <UButton icon="i-lucide-film" size="xs" color="neutral" variant="soft" to="/media/video">
              {{ t('dashboard.actions.videoTools') }}
            </UButton>
            <UButton icon="i-lucide-id-card" size="xs" color="neutral" variant="soft" to="/browser-hub">
              {{ t('nav.profiles_list') }}
            </UButton>
            <UButton icon="i-lucide-key" size="xs" color="neutral" variant="soft" to="/system/ai-keys">
              {{ t('nav.ai_keys') }}
            </UButton>
            <UButton icon="i-lucide-bot" size="xs" color="neutral" variant="soft" to="/chat">
              {{ t('dashboard.actions.openChat') }}
            </UButton>
            <UButton icon="i-lucide-folder-cog" size="xs" color="neutral" variant="soft" to="/utilities">
              {{ t('nav.utilities') }}
            </UButton>
          </div>
        </BaseBentoCard>

        <!-- Core modules -->
        <BaseBentoCard :span="4" :span-sm="6" :title="t('dashboard.modules.toolsTitle')" icon="i-lucide-film">
          <p class="mb-3 text-[11px] leading-relaxed text-muted">{{ t('dashboard.modules.toolsDesc') }}</p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="tm-tile text-start" @click="router.push('/media/download')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-arrow-down-to-line" class="size-3.5 text-rose-500" />
                {{ t('nav.download') }}
              </span>
              <span class="text-[10px] leading-snug text-muted">YouTube, TikTok, HLS M3U8, Playlists</span>
            </button>
            <button type="button" class="tm-tile text-start" @click="router.push('/media/video')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-file-cog" class="size-3.5 text-rose-500" />
                {{ t('nav.video') }}
              </span>
              <span class="text-[10px] leading-snug text-muted">Convert, Join, Split, Image2Video, Audio</span>
            </button>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-default/60 pt-3">
            <UButton to="/media/download" size="xs" color="neutral" variant="ghost" icon="i-lucide-download">
              {{ t('dashboard.actions.openDownloader') }}
            </UButton>
            <UButton to="/media/video" size="xs" color="neutral" variant="ghost" icon="i-lucide-film">
              {{ t('dashboard.actions.videoTools') }}
            </UButton>
          </div>
        </BaseBentoCard>

        <BaseBentoCard :span="4" :span-sm="6" :title="t('dashboard.modules.profilesTitle')" icon="i-lucide-fingerprint">
          <p class="mb-3 text-[11px] leading-relaxed text-muted">{{ t('dashboard.modules.profilesDesc') }}</p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="tm-tile text-start" @click="router.push('/browser-hub')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-id-card" class="size-3.5 text-sky-500" />
                {{ t('nav.profiles_list') }}
              </span>
              <span class="text-[10px] leading-snug text-muted">Chromium, Firefox, Camoufox, Fingerprint</span>
            </button>
            <button type="button" class="tm-tile text-start" @click="router.push('/browser-hub/proxies')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-globe" class="size-3.5 text-sky-500" />
                {{ t('nav.profile_proxies') }}
              </span>
              <span class="text-[10px] leading-snug text-muted">HTTP, SOCKS5, Geo & Latency Check</span>
            </button>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-default/60 pt-3">
            <UButton to="/browser-hub" size="xs" color="neutral" variant="ghost" icon="i-lucide-id-card">
              {{ t('dashboard.actions.manageProfiles') }}
            </UButton>
            <UButton to="/browser-hub/proxies" size="xs" color="neutral" variant="ghost" icon="i-lucide-globe">
              {{ t('dashboard.actions.manageProxies') }}
            </UButton>
          </div>
        </BaseBentoCard>

        <BaseBentoCard :span="4" :span-sm="6" :title="t('dashboard.modules.utilitiesTitle')" icon="i-lucide-sparkles">
          <p class="mb-3 text-[11px] leading-relaxed text-muted">{{ t('dashboard.modules.utilitiesDesc') }}</p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="tm-tile text-start" @click="router.push('/system/ai-keys')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-key" class="size-3.5 text-amber-500" />
                {{ t('nav.ai_keys') }}
              </span>
              <span class="text-[10px] leading-snug text-muted">Providers, models, credentials</span>
            </button>
            <button type="button" class="tm-tile text-start" @click="router.push('/resources/connections')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-cable" class="size-3.5 text-amber-500" />
                {{ t('nav.connections') }}
              </span>
              <span class="text-[10px] leading-snug text-muted">Shared hub credentials</span>
            </button>
            <button type="button" class="tm-tile text-start" @click="router.push('/chat')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-bot" class="size-3.5 text-amber-500" />
                AI Chat
              </span>
              <span class="text-[10px] leading-snug text-muted">Hub-routed assistant</span>
            </button>
            <button type="button" class="tm-tile text-start" @click="router.push('/utilities')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-wrench" class="size-3.5 text-amber-500" />
                {{ t('nav.utilities') }}
              </span>
              <span class="text-[10px] leading-snug text-muted">Text, icons, encode, random</span>
            </button>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-default/60 pt-3">
            <UButton to="/system/ai-keys" size="xs" color="neutral" variant="ghost" icon="i-lucide-key">
              {{ t('nav.ai_keys') }}
            </UButton>
            <UButton to="/chat" size="xs" color="neutral" variant="ghost" icon="i-lucide-bot">
              {{ t('dashboard.actions.openChat') }}
            </UButton>
            <UButton to="/utilities" size="xs" color="neutral" variant="ghost" icon="i-lucide-folder-cog">
              {{ t('nav.utilities') }}
            </UButton>
          </div>
        </BaseBentoCard>

        <!-- Document Studio -->
        <BaseBentoCard :span="8" :span-sm="6" :title="t('document.home.title')" icon="i-lucide-file-text">
          <template #action>
            <UButton to="/document-studio" size="xs" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right">
              {{ t('common.open') }}
            </UButton>
          </template>

          <p class="mb-3 text-[11px] leading-relaxed text-muted">{{ t('document.home.description') }}</p>

          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" class="tm-tile text-start" @click="router.push('/document-studio/library')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-folder-tree" class="size-3.5 text-primary" />
                {{ t('nav.document_library') }}
              </span>
              <span class="text-[10px] leading-snug text-muted">
                {{ t('document.library.description') }}
              </span>
            </button>
            <button type="button" class="tm-tile text-start" @click="router.push('/document-studio/tools/convert')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-file-input" class="size-3.5 text-amber-500" />
                {{ t('nav.document_convert') }}
              </span>
              <span class="text-[10px] leading-snug text-muted">
                Word, Excel, Images -> PDF
              </span>
            </button>
            <button type="button" class="tm-tile text-start" @click="router.push('/document-studio/tools/split')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-scissors" class="size-3.5 text-blue-500" />
                {{ t('nav.document_split') }}
              </span>
              <span class="text-[10px] leading-snug text-muted">
                {{ t('document.operations.split.description') }}
              </span>
            </button>
            <button type="button" class="tm-tile text-start" @click="router.push('/document-studio/tools/extract')">
              <span class="flex items-center gap-1.5 text-[11px] font-medium text-highlighted">
                <UIcon name="i-lucide-scan-text" class="size-3.5 text-emerald-500" />
                {{ t('nav.document_extract') }}
              </span>
              <span class="text-[10px] leading-snug text-muted">
                AI Vision & Structure Table
              </span>
            </button>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-default/60 pt-3">
            <UButton to="/document-studio/library" size="xs" color="neutral" variant="ghost" icon="i-lucide-folder-tree">
              {{ t('nav.document_library') }}
            </UButton>
            <UButton to="/document-studio/tools/split" size="xs" color="neutral" variant="ghost" icon="i-lucide-scissors">
              {{ t('nav.document_split') }}
            </UButton>
            <UButton to="/document-studio/tools/merge" size="xs" color="neutral" variant="ghost" icon="i-lucide-layers">
              {{ t('nav.document_merge') }}
            </UButton>
            <UButton to="/document-studio/tools/convert" size="xs" color="neutral" variant="ghost" icon="i-lucide-file-input">
              {{ t('nav.document_convert') }}
            </UButton>
            <UButton to="/document-studio/tools/extract" size="xs" color="neutral" variant="ghost" icon="i-lucide-scan-text">
              {{ t('nav.document_extract') }}
            </UButton>
            <UButton to="/document-studio/activity" size="xs" color="neutral" variant="ghost" icon="i-lucide-history">
              {{ t('nav.document_activity') }}
            </UButton>
          </div>
        </BaseBentoCard>

        <!-- System status -->
        <BaseBentoCard :span="4" :span-sm="6" :title="t('dashboard.systemStatus')" icon="i-lucide-activity">
          <ul class="divide-y divide-default/60">
            <li class="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
              <UIcon name="i-lucide-cpu" class="mt-0.5 size-4 shrink-0 text-emerald-500" />
              <div class="min-w-0">
                <p class="text-[11px] font-medium text-highlighted">{{ t('dashboard.system.desktopEngine') }}</p>
                <p class="text-[10px] leading-snug text-muted">{{ t('dashboard.system.desktopDesc') }}</p>
              </div>
            </li>
            <li class="flex items-start gap-2.5 py-2">
              <UIcon name="i-lucide-film" class="mt-0.5 size-4 shrink-0 text-primary" />
              <div class="min-w-0">
                <p class="text-[11px] font-medium text-highlighted">{{ t('dashboard.system.ffmpegEngine') }}</p>
                <p class="text-[10px] leading-snug text-muted">{{ t('dashboard.system.ffmpegDesc') }}</p>
              </div>
            </li>
            <li class="flex items-start gap-2.5 py-2">
              <UIcon name="i-lucide-hard-drive" class="mt-0.5 size-4 shrink-0 text-sky-500" />
              <div class="min-w-0">
                <p class="text-[11px] font-medium text-highlighted">{{ t('dashboard.system.mediaStorage') }}</p>
                <p class="text-[10px] leading-snug text-muted">{{ t('dashboard.system.mediaDesc') }}</p>
              </div>
            </li>
            <li class="flex items-start gap-2.5 py-2 last:pb-0">
              <UIcon name="i-lucide-shield-check" class="mt-0.5 size-4 shrink-0 text-indigo-500" />
              <div class="min-w-0">
                <p class="text-[11px] font-medium text-highlighted">{{ t('dashboard.system.authProvider') }}</p>
                <p class="text-[10px] leading-snug text-muted">{{ t('dashboard.system.authDesc') }}</p>
              </div>
            </li>
          </ul>
        </BaseBentoCard>
      </BaseBentoGrid>
    </div>
  </BasePage>
</template>

<style scoped>
.stat-label {
  margin: 0;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}

.stat-value {
  margin: 0.125rem 0 0.5rem;
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: var(--ui-text-highlighted);
}

.stat-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 4px;
  border: 1px solid var(--tm-hairline);
  background-color: color-mix(in oklab, var(--ui-primary) 10%, transparent);
  color: var(--ui-primary);
}
</style>
