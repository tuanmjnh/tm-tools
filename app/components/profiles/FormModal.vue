<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { BrowserProfile, ProfileGroup, ProfileProxy, ProfileAccount } from '~/types'
import { generateRealisticFingerprint } from '~/utils/fingerprint'

const props = defineProps<{
  modelValue: boolean
  profile?: BrowserProfile | null
  groups: ProfileGroup[]
  proxies: ProfileProxy[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const toast = useToast()
const isOpen = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
})

const activeTab = ref('general')

interface FormState {
  name: string
  group_id: string
  proxy_id: string
  raw_proxy: string
  browser_id: string
  browser_type: string
  browser_engine: string
  browser_version: string
  custom_exe: string
  stealth_mode: boolean
  stealth_engine: string
  os: string
  user_agent: string
  screen_resolution: string
  color_depth: number
  hardware_concurrency: number
  device_memory: number
  languages: string
  webrtc_mode: string
  timezone_mode: string
  timezone_val: string
  geo_mode: string
  canvas_mode: string
  webgl_mode: string
  webgl_vendor: string
  webgl_renderer: string
  audio_mode: string
  client_rects_mode: string
  fonts_mode: string
  start_url: string
  notes: string
  tags: string[]
}

const form = ref<FormState>({
  name: '',
  group_id: '',
  proxy_id: '',
  raw_proxy: '',
  browser_id: '',
  browser_type: 'chrome',
  browser_engine: 'chromium',
  browser_version: '124.0.0.0',
  custom_exe: '',
  stealth_mode: true,
  stealth_engine: 'playwright_stealth',
  os: 'windows',
  user_agent: '',
  screen_resolution: '1920x1080',
  color_depth: 24,
  hardware_concurrency: 8,
  device_memory: 8,
  languages: 'en-US,en',
  webrtc_mode: 'proxy',
  timezone_mode: 'auto',
  timezone_val: 'Asia/Ho_Chi_Minh',
  geo_mode: 'auto',
  canvas_mode: 'noise',
  webgl_mode: 'noise',
  webgl_vendor: 'Google Inc. (NVIDIA)',
  webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
  audio_mode: 'noise',
  client_rects_mode: 'noise',
  fonts_mode: 'system',
  start_url: 'https://whoer.net',
  notes: '',
  tags: []
})

const browserCategory = ref<'basic' | 'specialized'>('basic')
const availableBrowsers = ref<Array<{ id: string, name: string, engine: string, version: string, executablePath: string, status?: string }>>([])
const loadingBrowsers = ref(false)

const specializedBrowsers = [
  {
    id: 'camoufox',
    name: 'Camoufox',
    desc: 'Firefox-based anti-detect runtime with native C++ fingerprint masking',
    engine: 'camoufox',
    icon: 'i-lucide-shield-alert'
  },
  {
    id: 'donut',
    name: 'Donut Browser',
    desc: 'Chromium-based anti-detect runtime with CDP automation concealment',
    engine: 'donut',
    icon: 'i-lucide-cookie'
  },
  {
    id: 'browser_oxide',
    name: 'Browser Oxide',
    desc: 'Ultra-fast Rust-based browser engine with memory-safe headless CDP',
    engine: 'browser_oxide',
    icon: 'i-lucide-cpu'
  }
]

async function loadBrowsers() {
  if (!window.electronAPI?.browser) return
  loadingBrowsers.value = true
  try {
    const res = await window.electronAPI.browser.detect()
    if (res.success && res.data) {
      availableBrowsers.value = res.data
    } else {
      const listRes = await window.electronAPI.browser.list()
      if (listRes.success && listRes.data) {
        availableBrowsers.value = listRes.data
      }
    }
  } catch {
    try {
      const listRes = await window.electronAPI.browser.list()
      if (listRes.success && listRes.data) {
        availableBrowsers.value = listRes.data
      }
    } catch {
      // ignore
    }
  } finally {
    loadingBrowsers.value = false
  }
}

function isSpecializedDetected(engine: string) {
  return availableBrowsers.value.find(b => b.engine === engine && (b.status === 'available' || !b.status))
}

const standardBrowserItems = computed(() => {
  const list = availableBrowsers.value.filter(b => ['chromium', 'firefox'].includes(b.engine))
  const source = list.length > 0 ? list : availableBrowsers.value
  return source
    .filter(b => Boolean(b.id))
    .map(b => ({
      label: `${b.name} (v${b.version || 'unknown'}) - [${b.engine}]`,
      value: b.id
    }))
})

function onStandardBrowserChange(val: string) {
  const selected = availableBrowsers.value.find(b => b.id === val)
  if (selected) {
    form.value.browser_id = selected.id
    form.value.browser_type = selected.engine === 'firefox' ? 'firefox' : 'chrome'
    form.value.browser_engine = selected.engine
    form.value.browser_version = selected.version || '124.0.0.0'
  }
}

function onSelectCategory(cat: 'basic' | 'specialized') {
  browserCategory.value = cat
  if (cat === 'basic') {
    const first = availableBrowsers.value.find(b => ['chromium', 'firefox'].includes(b.engine)) || availableBrowsers.value[0]
    if (first) {
      form.value.browser_id = first.id
      form.value.browser_type = first.engine === 'firefox' ? 'firefox' : 'chrome'
      form.value.browser_engine = first.engine
      form.value.browser_version = first.version || '124.0.0.0'
    } else {
      form.value.browser_type = 'chrome'
      form.value.browser_engine = 'chromium'
    }
  } else {
    onSelectSpecialized('camoufox')
  }
}

function onSelectSpecialized(id: string) {
  const item = specializedBrowsers.find(x => x.id === id)
  if (item) {
    const detected = isSpecializedDetected(item.engine)
    form.value.browser_type = item.id
    form.value.browser_engine = item.engine
    form.value.browser_id = detected ? detected.id : ''
    if (detected?.version) {
      form.value.browser_version = detected.version
    }
  }
}

function goToBrowserSettings() {
  isOpen.value = false
  navigateTo('/settings/browsers')
}

const proxyMode = ref<'direct' | 'saved' | 'custom'>('direct')
const accounts = ref<Partial<ProfileAccount>[]>([])
const newTag = ref('')
const saving = ref(false)
const testingProxy = ref(false)
const proxyTestResult = ref<{ status: string, ip?: string, latency_ms?: number } | null>(null)

watch(() => props.modelValue, (open) => {
  if (open) {
    loadBrowsers()
    if (props.profile) {
      const bType = props.profile.browser_type || 'chrome'
      const bEngine = props.profile.browser_engine || 'chromium'
      const customExe = props.profile.custom_exe || ''

      if (['camoufox', 'donut', 'browser_oxide'].includes(bEngine) || ['camoufox', 'donut', 'browser_oxide'].includes(bType)) {
        browserCategory.value = 'specialized'
      } else {
        browserCategory.value = 'basic'
      }

      form.value = {
        name: props.profile.name || '',
        group_id: props.profile.group_id || '',
        proxy_id: props.profile.proxy_id || '',
        raw_proxy: props.profile.raw_proxy || '',
        browser_id: props.profile.browser_id || '',
        browser_type: bType,
        browser_engine: bEngine,
        browser_version: props.profile.browser_version || '124.0.0.0',
        custom_exe: customExe,
        stealth_mode: props.profile.stealth_mode ?? true,
        stealth_engine: props.profile.stealth_engine || 'playwright_stealth',
        os: props.profile.os || 'windows',
        user_agent: props.profile.user_agent || '',
        screen_resolution: props.profile.screen_resolution || '1920x1080',
        color_depth: props.profile.color_depth ?? 24,
        hardware_concurrency: props.profile.hardware_concurrency ?? 8,
        device_memory: props.profile.device_memory ?? 8,
        languages: props.profile.languages || 'en-US,en',
        webrtc_mode: props.profile.webrtc_mode || 'proxy',
        timezone_mode: props.profile.timezone_mode || 'auto',
        timezone_val: props.profile.timezone_val || 'Asia/Ho_Chi_Minh',
        geo_mode: props.profile.geo_mode || 'auto',
        canvas_mode: props.profile.canvas_mode || 'noise',
        webgl_mode: props.profile.webgl_mode || 'noise',
        webgl_vendor: props.profile.webgl_vendor || '',
        webgl_renderer: props.profile.webgl_renderer || '',
        audio_mode: props.profile.audio_mode || 'noise',
        client_rects_mode: props.profile.client_rects_mode || 'noise',
        fonts_mode: props.profile.fonts_mode || 'system',
        start_url: props.profile.start_url || 'https://whoer.net',
        notes: props.profile.notes || '',
        tags: props.profile.tags ? [...props.profile.tags] : []
      }
      accounts.value = props.profile.accounts ? [...props.profile.accounts] : []
      if (props.profile.proxy_id) {
        proxyMode.value = 'saved'
      } else if (props.profile.raw_proxy) {
        proxyMode.value = 'custom'
      } else {
        proxyMode.value = 'direct'
      }
    } else {
      // New profile with randomized fingerprint
      browserCategory.value = 'basic'
      const fp = generateRealisticFingerprint('windows')
      form.value = {
        name: `Profile ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        group_id: props.groups[0]?.id || '',
        proxy_id: '',
        raw_proxy: '',
        ...fp,
        browser_id: '',
        browser_type: 'chrome',
        browser_engine: 'chromium',
        browser_version: fp.browser_version || '124.0.0.0',
        custom_exe: '',
        stealth_mode: true,
        stealth_engine: 'playwright_stealth',
        start_url: 'https://whoer.net',
        notes: '',
        tags: []
      }
      accounts.value = []
      proxyMode.value = 'direct'
    }
    activeTab.value = 'general'
    proxyTestResult.value = null
  }
})

function onRandomize() {
  const currentOs = (form.value.os || 'windows') as 'windows' | 'macos' | 'linux'
  const fp = generateRealisticFingerprint(currentOs)
  form.value = {
    ...form.value,
    ...fp
  }
  toast.add({ title: t('profiles.fingerprint'), description: t('profiles.randomizeFingerprint'), color: 'success' })
}

function onOsChange(newOs: 'windows' | 'macos' | 'linux') {
  form.value.os = newOs
  const fp = generateRealisticFingerprint(newOs)
  form.value = {
    ...form.value,
    ...fp
  }
}

function addTag() {
  const val = newTag.value.trim()
  if (val && !form.value.tags?.includes(val)) {
    form.value.tags = [...(form.value.tags || []), val]
    newTag.value = ''
  }
}

function removeTag(tag: string) {
  form.value.tags = (form.value.tags || []).filter(t => t !== tag)
}

function addAccountRow() {
  accounts.value.push({
    platform: 'facebook',
    username: '',
    password: '',
    two_fa_secret: ''
  })
}

function removeAccountRow(index: number) {
  accounts.value.splice(index, 1)
}

async function testCurrentProxy() {
  if (!window.electronAPI?.tools?.profiles) return
  let proxyToCheck: Partial<ProfileProxy> | null = null

  if (proxyMode.value === 'saved' && form.value.proxy_id) {
    const p = props.proxies.find(x => x.id === form.value.proxy_id)
    if (p) proxyToCheck = p
  } else if (proxyMode.value === 'custom' && form.value.raw_proxy) {
    const parts = form.value.raw_proxy.split(':')
    if (parts.length >= 2) {
      proxyToCheck = {
        name: 'Custom',
        type: 'http',
        host: parts[0],
        port: Number(parts[1]),
        username: parts[2] || '',
        password: parts[3] || ''
      }
    }
  }

  if (!proxyToCheck) {
    toast.add({ title: t('global.error'), description: 'Invalid proxy configuration', color: 'error' })
    return
  }

  testingProxy.value = true
  proxyTestResult.value = null
  try {
    const res = await window.electronAPI.tools.profiles.checkProxy(proxyToCheck)
    if (res.success && res.data) {
      proxyTestResult.value = {
        status: res.data.status || 'active',
        ip: res.data.ip,
        latency_ms: res.data.latency_ms
      }
    } else {
      proxyTestResult.value = { status: 'dead' }
    }
  } finally {
    testingProxy.value = false
  }
}

async function onSave() {
  if (!form.value.name?.trim()) {
    toast.add({ title: t('error.validation'), description: t('error.required'), color: 'error' })
    return
  }

  if (!window.electronAPI?.tools?.profiles) return
  saving.value = true

  try {
    let proxyId: string | null = null
    let rawProxy: string | null = null

    if (proxyMode.value === 'saved') {
      proxyId = form.value.proxy_id || null
    } else if (proxyMode.value === 'custom') {
      rawProxy = form.value.raw_proxy || null
    }

    const payload: Partial<BrowserProfile> = {
      ...form.value,
      group_id: form.value.group_id || null,
      proxy_id: proxyId,
      raw_proxy: rawProxy,
      user_agent: form.value.user_agent || null,
      notes: form.value.notes || null,
      accounts: accounts.value as ProfileAccount[]
    }

    if (props.profile?.id) {
      await window.electronAPI.tools.profiles.updateProfile({
        id: props.profile.id,
        data: payload
      })
    } else {
      await window.electronAPI.tools.profiles.createProfile(payload)
    }

    toast.add({ title: t('global.success'), description: t('profiles.profileSaved'), color: 'success' })
    isOpen.value = false
    emit('saved')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.add({ title: t('global.error'), description: message, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="profile ? t('profiles.editProfile') : t('profiles.addProfile')"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Tabs Header -->
        <div class="flex border-b border-gray-200 dark:border-gray-800 gap-2">
          <UButton
            :variant="activeTab === 'general' ? 'solid' : 'ghost'"
            color="neutral"
            size="sm"
            icon="i-lucide-info"
            :label="t('profiles.tabGeneral')"
            @click="activeTab = 'general'"
          />
          <UButton
            :variant="activeTab === 'proxy' ? 'solid' : 'ghost'"
            color="neutral"
            size="sm"
            icon="i-lucide-network"
            :label="t('profiles.tabProxy')"
            @click="activeTab = 'proxy'"
          />
          <UButton
            :variant="activeTab === 'fingerprint' ? 'solid' : 'ghost'"
            color="neutral"
            size="sm"
            icon="i-lucide-fingerprint"
            :label="t('profiles.tabFingerprint')"
            @click="activeTab = 'fingerprint'"
          />
          <UButton
            :variant="activeTab === 'accounts' ? 'solid' : 'ghost'"
            color="neutral"
            size="sm"
            icon="i-lucide-users"
            :label="t('profiles.tabAccounts')"
            @click="activeTab = 'accounts'"
          />
        </div>

        <!-- TAB 1: GENERAL -->
        <div v-show="activeTab === 'general'" class="space-y-4 py-2">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormField :label="t('profiles.name')" required>
              <UInput v-model="form.name" class="w-full" placeholder="e.g. Facebook 01" />
            </UFormField>

            <UFormField :label="t('profiles.groups')">
              <USelect
                v-model="form.group_id"
                class="w-full"
                :items="groups.filter(g => Boolean(g.id)).map(g => ({ label: g.name, value: g.id }))"
                placeholder="Select group..."
              />
            </UFormField>
          </div>

          <!-- Browser Runtime Configuration -->
          <div
            class="p-3.5 border rounded-lg border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 space-y-3"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 font-medium text-sm text-gray-800 dark:text-gray-200">
                <UIcon name="i-lucide-cpu" class="size-4 text-primary" />
                <span>{{ t('profiles.browserAdapter') }}</span>
              </div>
              <div class="flex gap-1">
                <UButton
                  size="xs"
                  :variant="browserCategory === 'basic' ? 'solid' : 'ghost'"
                  color="neutral"
                  :label="t('profiles.browserBasic')"
                  @click="onSelectCategory('basic')"
                />
                <UButton
                  size="xs"
                  :variant="browserCategory === 'specialized' ? 'solid' : 'ghost'"
                  color="neutral"
                  :label="t('profiles.browserSpecialized')"
                  @click="onSelectCategory('specialized')"
                />
              </div>
            </div>

            <!-- Standard Browsers -->
            <div v-if="browserCategory === 'basic'" class="space-y-2">
              <UFormField :label="t('profiles.detectedBrowsers')">
                <USelect
                  v-model="form.browser_id"
                  class="w-full"
                  :items="standardBrowserItems"
                  placeholder="Select installed browser..."
                  @update:model-value="onStandardBrowserChange"
                />
              </UFormField>
              <div class="flex items-center justify-between text-xs text-gray-500">
                <span>Auto-detected from local system</span>
                <div class="flex items-center gap-2">
                  <UButton
                    size="xs"
                    variant="link"
                    icon="i-lucide-refresh-cw"
                    :loading="loadingBrowsers"
                    label="Re-scan"
                    @click="loadBrowsers"
                  />
                  <span class="text-gray-300 dark:text-gray-700">|</span>
                  <UButton
                    size="xs"
                    variant="link"
                    icon="i-lucide-settings"
                    :label="t('profiles.openBrowserSettings')"
                    @click="goToBrowserSettings"
                  />
                </div>
              </div>
            </div>

            <!-- Specialized Browsers (Camoufox, Donut, Browser Oxide) -->
            <div v-else class="space-y-2.5">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div
                  v-for="item in specializedBrowsers"
                  :key="item.id"
                  class="p-2.5 rounded-md border cursor-pointer transition-all flex flex-col justify-between"
                  :class="form.browser_type === item.id ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/30' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'"
                  @click="onSelectSpecialized(item.id)"
                >
                  <div>
                    <div class="flex items-center justify-between gap-1">
                      <div class="flex items-center gap-1.5 font-medium text-xs truncate">
                        <UIcon :name="item.icon" class="size-4 shrink-0" />
                        <span class="truncate">{{ item.name }}</span>
                      </div>
                      <UBadge
                        size="xs"
                        :color="isSpecializedDetected(item.engine) ? 'success' : 'neutral'"
                        variant="subtle"
                      >
                        {{ isSpecializedDetected(item.engine) ? t('profiles.configured') : t('profiles.notConfigured')
                        }}
                      </UBadge>
                    </div>
                    <p class="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                      {{ item.desc }}
                    </p>
                  </div>
                  <div
                    class="mt-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-gray-400"
                  >
                    <span>Engine: {{ item.engine }}</span>
                    <span v-if="isSpecializedDetected(item.engine)" class="text-success font-semibold">
                      v{{ isSpecializedDetected(item.engine)?.version || 'Ready' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Alert if current selected specialized engine is not detected -->
              <div
                v-if="!isSpecializedDetected(form.browser_engine)"
                class="flex items-center justify-between p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400"
              >
                <div class="flex items-center gap-1.5">
                  <UIcon name="i-lucide-alert-triangle" class="size-4 shrink-0" />
                  <span>This browser does not have a runtime path configured.</span>
                </div>
                <UButton
                  size="xs"
                  color="warning"
                  variant="subtle"
                  icon="i-lucide-external-link"
                  :label="t('profiles.openBrowserSettings')"
                  @click="goToBrowserSettings"
                />
              </div>
            </div>
          </div>

          <UFormField :label="t('profiles.startUrl')">
            <UInput
              v-model="form.start_url"
              class="w-full"
              icon="i-lucide-globe"
              placeholder="https://whoer.net"
            />
          </UFormField>

          <UFormField :label="t('profiles.tags')">
            <div class="space-y-2">
              <div class="flex flex-wrap gap-1.5">
                <UBadge
                  v-for="tag in form.tags"
                  :key="tag"
                  color="neutral"
                  variant="subtle"
                  class="gap-1 cursor-pointer"
                  @click="removeTag(tag)"
                >
                  {{ tag }}
                  <UIcon name="i-lucide-x" class="size-3" />
                </UBadge>
              </div>
              <div class="flex gap-2">
                <UInput
                  v-model="newTag"
                  placeholder="Add tag and press Enter"
                  size="sm"
                  class="flex-1"
                  @keydown.enter.prevent="addTag"
                />
                <UButton
                  size="sm"
                  variant="outline"
                  icon="i-lucide-plus"
                  @click="addTag"
                />
              </div>
            </div>
          </UFormField>

          <UFormField :label="t('profiles.notes')">
            <UTextarea
              v-model="form.notes"
              class="w-full"
              :rows="3"
              placeholder="Notes, account credentials, or recovery details..."
            />
          </UFormField>
        </div>

        <!-- TAB 2: PROXY & NETWORK -->
        <div v-show="activeTab === 'proxy'" class="space-y-4 py-2">
          <UFormField :label="t('profiles.proxies')">
            <div class="grid grid-cols-3 gap-2 mb-3">
              <UButton
                :variant="proxyMode === 'direct' ? 'solid' : 'outline'"
                color="neutral"
                size="sm"
                :label="t('profiles.directProxy')"
                @click="proxyMode = 'direct'"
              />
              <UButton
                :variant="proxyMode === 'saved' ? 'solid' : 'outline'"
                color="neutral"
                size="sm"
                :label="t('profiles.savedProxy')"
                @click="proxyMode = 'saved'"
              />
              <UButton
                :variant="proxyMode === 'custom' ? 'solid' : 'outline'"
                color="neutral"
                size="sm"
                :label="t('profiles.customProxy')"
                @click="proxyMode = 'custom'"
              />
            </div>

            <!-- Saved Proxy Selection -->
            <div v-if="proxyMode === 'saved'" class="space-y-2">
              <USelect
                v-model="form.proxy_id"
                class="w-full"
                :items="proxies.filter(p => Boolean(p.id)).map(p => ({ label: `${p.name} (${p.host}:${p.port})`, value: p.id }))"
                placeholder="Choose from proxy pool..."
              />
            </div>

            <!-- Custom Proxy String -->
            <div v-if="proxyMode === 'custom'" class="space-y-2">
              <UInput v-model="form.raw_proxy" class="w-full" :placeholder="t('profiles.proxyFormatPlaceholder')" />
              <p class="text-xs text-gray-500">
                Supports IP:Port or IP:Port:User:Pass
              </p>
            </div>

            <!-- Test Proxy Section -->
            <div
              v-if="proxyMode !== 'direct'"
              class="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800"
            >
              <UButton
                size="sm"
                variant="outline"
                icon="i-lucide-activity"
                :loading="testingProxy"
                :label="t('profiles.checkProxy')"
                @click="testCurrentProxy"
              />

              <div v-if="proxyTestResult" class="flex items-center gap-2 text-sm">
                <UBadge :color="proxyTestResult.status === 'active' ? 'success' : 'error'" variant="subtle">
                  {{ proxyTestResult.status === 'active' ? t('profiles.proxyLive') : t('profiles.proxyDead') }}
                </UBadge>
                <span v-if="proxyTestResult.ip" class="text-xs font-mono text-gray-600 dark:text-gray-400">IP: {{
                  proxyTestResult.ip }} ({{ proxyTestResult.latency_ms }}ms)</span>
              </div>
            </div>
          </UFormField>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <UFormField :label="t('profiles.webrtc')">
              <USelect
                v-model="form.webrtc_mode"
                class="w-full"
                :items="[
                  { label: 'Follow Proxy / Default', value: 'proxy' },
                  { label: 'Disable WebRTC UDP (Leak Protection)', value: 'disabled' },
                  { label: 'Real IP', value: 'real' }
                ]"
              />
            </UFormField>

            <UFormField :label="t('profiles.timezone')">
              <USelect
                v-model="form.timezone_mode"
                class="w-full"
                :items="[
                  { label: 'Auto (Based on Proxy / System)', value: 'auto' },
                  { label: 'Manual', value: 'manual' }
                ]"
              />
            </UFormField>
          </div>
        </div>

        <!-- TAB 3: FINGERPRINT & OS -->
        <div v-show="activeTab === 'fingerprint'" class="space-y-4 py-2">
          <div class="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ t('profiles.os') }}:</span>
              <div class="flex gap-1">
                <UButton
                  size="xs"
                  :variant="form.os === 'windows' ? 'solid' : 'ghost'"
                  color="neutral"
                  icon="i-lucide-monitor"
                  label="Windows"
                  @click="onOsChange('windows')"
                />
                <UButton
                  size="xs"
                  :variant="form.os === 'macos' ? 'solid' : 'ghost'"
                  color="neutral"
                  icon="i-lucide-apple"
                  label="macOS"
                  @click="onOsChange('macos')"
                />
                <UButton
                  size="xs"
                  :variant="form.os === 'linux' ? 'solid' : 'ghost'"
                  color="neutral"
                  icon="i-lucide-terminal"
                  label="Linux"
                  @click="onOsChange('linux')"
                />
              </div>
            </div>

            <UButton
              size="sm"
              color="primary"
              variant="soft"
              icon="i-lucide-dice-5"
              :label="t('profiles.randomizeFingerprint')"
              @click="onRandomize"
            />
          </div>

          <UFormField :label="t('profiles.userAgent')">
            <UInput v-model="form.user_agent" class="w-full font-mono text-xs" />
          </UFormField>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <UFormField :label="t('profiles.resolution')">
              <UInput v-model="form.screen_resolution" class="w-full" placeholder="1920x1080" />
            </UFormField>

            <UFormField label="CPU Cores">
              <UInput v-model.number="form.hardware_concurrency" type="number" class="w-full" />
            </UFormField>

            <UFormField label="RAM (GB)">
              <UInput v-model.number="form.device_memory" type="number" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormField :label="t('profiles.canvas')">
              <USelect
                v-model="form.canvas_mode"
                class="w-full"
                :items="[
                  { label: t('profiles.noise'), value: 'noise' },
                  { label: t('profiles.off'), value: 'off' },
                  { label: t('profiles.block'), value: 'block' }
                ]"
              />
            </UFormField>

            <UFormField :label="t('profiles.audio')">
              <USelect
                v-model="form.audio_mode"
                class="w-full"
                :items="[
                  { label: t('profiles.noise'), value: 'noise' },
                  { label: t('profiles.off'), value: 'off' }
                ]"
              />
            </UFormField>
          </div>

          <UFormField :label="t('profiles.webgl')">
            <div class="space-y-2">
              <UInput v-model="form.webgl_vendor" placeholder="WebGL Vendor" class="w-full text-xs font-mono" />
              <UInput v-model="form.webgl_renderer" placeholder="WebGL Renderer" class="w-full text-xs font-mono" />
            </div>
          </UFormField>

          <!-- Playwright Stealth Injection Toggle -->
          <div
            class="p-3.5 border rounded-lg border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 flex items-center justify-between"
          >
            <div class="space-y-0.5">
              <div class="flex items-center gap-1.5 font-medium text-sm text-gray-800 dark:text-gray-200">
                <UIcon name="i-lucide-shield-check" class="size-4 text-primary" />
                <span>{{ t('profiles.stealthMode') }}</span>
              </div>
              <p class="text-xs text-gray-500">
                {{ t('profiles.stealthModeDesc') }}
              </p>
            </div>
            <USwitch v-model="form.stealth_mode" />
          </div>
        </div>

        <!-- TAB 4: ACCOUNTS & STORAGE -->
        <div v-show="activeTab === 'accounts'" class="space-y-4 py-2">
          <div class="flex items-center justify-between">
            <p class="text-sm text-gray-500">
              Save login credentials for quick auto-fill or reference with this profile.
            </p>
            <UButton
              size="xs"
              variant="soft"
              color="primary"
              icon="i-lucide-plus"
              :label="t('profiles.addAccount')"
              @click="addAccountRow"
            />
          </div>

          <div
            v-if="accounts.length === 0"
            class="text-center py-6 border border-dashed rounded-lg border-gray-200 dark:border-gray-800 text-gray-400 text-sm"
          >
            No accounts linked yet. Click "Add Account" to attach social or platform accounts.
          </div>

          <div
            v-for="(acc, idx) in accounts"
            :key="idx"
            class="flex items-center gap-2 p-2 border rounded-md border-gray-100 dark:border-gray-800"
          >
            <USelect
              v-model="acc.platform"
              size="sm"
              class="w-32"
              :items="[
                { label: 'Facebook', value: 'facebook' },
                { label: 'Google', value: 'google' },
                { label: 'TikTok', value: 'tiktok' },
                { label: 'X / Twitter', value: 'x' },
                { label: 'Amazon', value: 'amazon' },
                { label: 'Other', value: 'other' }
              ]"
            />
            <UInput
              v-model="acc.username"
              size="sm"
              placeholder="Username / Email"
              class="flex-1"
            />
            <UInput
              v-model="acc.password"
              size="sm"
              type="password"
              placeholder="Password"
              class="flex-1"
            />
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-trash"
              @click="removeAccountRow(idx)"
            />
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('global.cancel')"
          @click="isOpen = false"
        />
        <UButton
          color="primary"
          variant="soft"
          :loading="saving"
          :label="t('global.save')"
          @click="onSave"
        />
      </div>
    </template>
  </UModal>
</template>
