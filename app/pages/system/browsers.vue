<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'

const { t } = useI18n()
const toast = useToast()

const loading = ref(false)
const detecting = ref(false)
const saving = ref(false)

interface BrowserConfigItem {
  id: string
  name: string
  engine: 'camoufox' | 'donut' | 'browser_oxide' | 'chromium' | 'firefox'
  key: string
  desc: string
  icon: string
  defaultPathPlaceholder: string
  path: string
  status: 'ready' | 'missing'
  detectedVersion?: string
  detectedPath?: string
  testing: boolean
  testResult?: { valid: boolean, version?: string, engine?: string, error?: string } | null
}

const runtimes = reactive<BrowserConfigItem[]>([
  {
    id: 'camoufox',
    name: 'Camoufox Anti-detect',
    engine: 'camoufox',
    key: 'CAMOUFOX_PATH',
    desc: 'Firefox-based anti-detect runtime with native C++ fingerprint masking',
    icon: 'i-lucide-shield-alert',
    defaultPathPlaceholder: 'C:\\Users\\...\\camoufox\\camoufox.exe',
    path: '',
    status: 'missing',
    testing: false
  },
  {
    id: 'donut',
    name: 'Donut Browser',
    engine: 'donut',
    key: 'DONUT_PATH',
    desc: 'Chromium-based anti-detect runtime with CDP automation concealment',
    icon: 'i-lucide-cookie',
    defaultPathPlaceholder: 'C:\\Program Files\\Donut Browser\\donut.exe',
    path: '',
    status: 'missing',
    testing: false
  },
  {
    id: 'browser_oxide',
    name: 'Browser Oxide',
    engine: 'browser_oxide',
    key: 'BROWSER_OXIDE_PATH',
    desc: 'Ultra-fast Rust-based browser engine with memory-safe headless CDP',
    icon: 'i-lucide-cpu',
    defaultPathPlaceholder: 'C:\\Users\\...\\.cargo\\bin\\browser_oxide.exe',
    path: '',
    status: 'missing',
    testing: false
  },
  {
    id: 'chromium',
    name: 'Google Chrome / Chromium',
    engine: 'chromium',
    key: 'CHROME_PATH',
    desc: 'Standard Chromium browser executable used for standard profiles',
    icon: 'i-lucide-chrome',
    defaultPathPlaceholder: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    path: '',
    status: 'missing',
    testing: false
  },
  {
    id: 'firefox',
    name: 'Mozilla Firefox',
    engine: 'firefox',
    key: 'FIREFOX_PATH',
    desc: 'Standard Firefox browser executable used for Gecko-based profiles',
    icon: 'i-lucide-globe',
    defaultPathPlaceholder: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    path: '',
    status: 'missing',
    testing: false
  }
])

async function loadConfig() {
  if (!window.electronAPI) return
  loading.value = true
  try {
    const conf = await window.electronAPI.getConfig()
    for (const item of runtimes) {
      if (conf[item.key]) {
        item.path = conf[item.key]!
      }
    }
    await detectAll()
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function detectAll() {
  if (!window.electronAPI?.browser) return
  detecting.value = true
  try {
    const res = await window.electronAPI.browser.detect()
    if (res.success && res.data) {
      const detectedList = res.data

      for (const item of runtimes) {
        const found = detectedList.find((b) => {
          if (item.engine === 'camoufox') return b.engine === 'camoufox'
          if (item.engine === 'donut') return b.engine === 'donut'
          if (item.engine === 'browser_oxide') return b.engine === 'browser_oxide'
          if (item.engine === 'firefox') return b.engine === 'firefox'
          return b.engine === 'chromium'
        })

        if (found) {
          item.status = 'ready'
          item.detectedVersion = found.version
          item.detectedPath = found.executablePath
        } else {
          item.status = 'missing'
          item.detectedVersion = undefined
          item.detectedPath = undefined
        }
      }
    }
  } catch {
    // ignore
  } finally {
    detecting.value = false
  }
}

async function onBrowse(item: BrowserConfigItem) {
  if (!window.electronAPI?.dialog) return
  try {
    const res = await window.electronAPI.dialog.openFile({
      title: `Select ${item.name} Executable`,
      filters: [{ name: 'Executable Files', extensions: ['exe', 'cmd', 'bat', 'sh'] }]
    })
    const selected = Array.isArray(res) ? res[0] : null
    if (selected) {
      item.path = selected
      await onTestBinary(item)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    toast.add({ title: t('global.error'), description: msg, color: 'error' })
  }
}

async function onTestBinary(item: BrowserConfigItem) {
  if (!item.path || !window.electronAPI?.browser) return
  item.testing = true
  item.testResult = null
  try {
    const res = await window.electronAPI.browser.testExecutable({ executablePath: item.path })
    if (res.success && res.data) {
      item.testResult = res.data
      if (res.data.valid) {
        item.status = 'ready'
        item.detectedVersion = res.data.version
        toast.add({
          title: item.name,
          description: `${t('settings.binaryValid')} (v${res.data.version || 'unknown'})`,
          color: 'success'
        })
      } else {
        toast.add({
          title: item.name,
          description: res.data.error || t('settings.binaryInvalid'),
          color: 'error'
        })
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    item.testResult = { valid: false, error: msg }
    toast.add({ title: item.name, description: msg, color: 'error' })
  } finally {
    item.testing = false
  }
}

async function onSaveAll() {
  if (!window.electronAPI) return
  saving.value = true
  try {
    const values: Record<string, string> = {}
    for (const item of runtimes) {
      if (item.path) {
        values[item.key] = item.path.trim()
      }
    }

    await window.electronAPI.setConfig(values)
    await detectAll()

    toast.add({
      title: t('global.success'),
      description: t('settings.pathsSaved'),
      color: 'success',
      icon: 'i-lucide-check-circle'
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    toast.add({ title: t('global.error'), description: msg, color: 'error' })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <BasePage id="browsers" :title="t('settings.browsersTitle')" :description="t('settings.browsersDesc')">
    <template #right>
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-scan"
          :loading="detecting"
          :label="detecting ? t('settings.detecting') : t('settings.detectAllBrowsers')"
          @click="detectAll"
        />
        <UButton
          color="primary"
          variant="soft"
          icon="i-lucide-save"
          :loading="saving"
          :label="t('settings.saveBrowserPaths')"
          @click="onSaveAll"
        />
      </div>
    </template>

    <div class="space-y-6">
      <!-- Runtime List Cards -->
      <div class="space-y-4">
        <UPageCard
          v-for="item in runtimes"
          :key="item.id"
          variant="subtle"
          class="transition-all hover:border-gray-300 dark:hover:border-gray-700"
        >
          <div class="space-y-3">
            <!-- Top Row: Icon, Title, Status Badge -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3">
                <div class="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
                  <UIcon :name="item.icon" class="size-5" />
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="font-semibold text-sm text-gray-900 dark:text-gray-100">
                      {{ item.name }}
                    </h3>
                    <UBadge size="xs" :color="item.status === 'ready' ? 'success' : 'neutral'" variant="subtle">
                      <UIcon
                        :name="item.status === 'ready' ? 'i-lucide-check-circle-2' : 'i-lucide-alert-circle'"
                        class="size-3 mr-1"
                      />
                      {{ item.status === 'ready' ? `${t('settings.statusDetected')} (v${item.detectedVersion || 'OK'})`
                        : t('settings.statusNotConfigured') }}
                    </UBadge>
                  </div>
                  <p class="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {{ item.desc }}
                  </p>
                </div>
              </div>
              <span
                class="text-[10px] font-mono uppercase tracking-wider text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded"
              >
                {{ item.key }}
              </span>
            </div>

            <!-- Detected Location info if auto-found -->
            <div
              v-if="item.detectedPath && !item.path"
              class="text-[11px] text-gray-500 bg-gray-50 dark:bg-gray-900/50 p-2 rounded border border-gray-200/60 dark:border-gray-800/60 flex items-center gap-1.5"
            >
              <UIcon name="i-lucide-info" class="size-3.5 text-primary shrink-0" />
              <span class="truncate">Auto-detected at: <span class="font-mono text-gray-700 dark:text-gray-300">{{
                item.detectedPath }}</span></span>
            </div>

            <!-- Executable Path Input + Actions -->
            <div class="flex gap-2">
              <UInput v-model="item.path" class="flex-1 font-mono text-xs" :placeholder="item.defaultPathPlaceholder" />
              <UButton
                size="sm"
                variant="soft"
                color="neutral"
                icon="i-lucide-folder-open"
                :label="t('settings.browseFile')"
                @click="onBrowse(item)"
              />
              <UButton
                size="sm"
                variant="soft"
                color="neutral"
                icon="i-lucide-check-circle"
                :loading="item.testing"
                :disabled="!item.path"
                :label="t('settings.testBinary')"
                @click="onTestBinary(item)"
              />
            </div>

            <!-- Test Result details -->
            <div v-if="item.testResult" class="flex items-center gap-2 text-xs">
              <UBadge :color="item.testResult.valid ? 'success' : 'error'" variant="subtle" size="sm">
                {{ item.testResult.valid ? t('settings.binaryValid') : t('settings.binaryInvalid') }}
              </UBadge>
              <span v-if="item.testResult.version" class="text-gray-500 font-mono">
                Version: {{ item.testResult.version }} ({{ item.testResult.engine }})
              </span>
              <span v-if="item.testResult.error" class="text-error font-medium">
                {{ item.testResult.error }}
              </span>
            </div>
          </div>
        </UPageCard>
      </div>

      <!-- Helpful Architecture Notes / Candidate Guide -->
      <div
        class="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 text-xs space-y-2 text-gray-600 dark:text-gray-400"
      >
        <div class="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-200">
          <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
          <span>Search Priority & Recommended Runtime Locations</span>
        </div>
        <p>
          When launching a Profile, the system prioritizes loading binaries in this order:
        </p>
        <ol class="list-decimal list-inside space-y-1 pl-1">
          <li>
            <strong>Configured path above</strong> (stored in <code
              class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded"
            >userData/config.env</code>).
          </li>
          <li>
            <strong>Application resources directory:</strong> <code
              class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded"
            >resources/bin/[camoufox|donut|oxide]/...</code>
          </li>
          <li>
            <strong>Standard machine installation path:</strong> <code
              class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded"
            >%LOCALAPPDATA%</code>, <code
              class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded"
            >%PROGRAMFILES%</code>, v.v.
          </li>
        </ol>
        <p class="text-gray-500">
          Once configured here, simply create a Profile and select the browser engine without needing to re-select the
          executable.
        </p>
      </div>
    </div>
  </BasePage>
</template>
