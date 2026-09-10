<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'

const { t } = useI18n()
const toast = useToast()

const hasElectron = computed(() => !!window.electronAPI?.isElectron)
const loading = ref(false)
const saving = ref(false)

interface ToolItem {
  key: 'TOOLS_YTDLP_PATH' | 'TOOLS_FFMPEG_PATH' | 'TOOLS_FFPROBE_PATH' | 'TOOLS_FFPLAY_PATH'
  type: 'ytDlp' | 'ffmpeg' | 'ffprobe' | 'ffplay'
  name: string
  desc: string
  icon: string
  placeholder: string
  path: string
  verified: boolean
  checking: boolean
}

const tools = reactive<ToolItem[]>([
  {
    key: 'TOOLS_YTDLP_PATH',
    type: 'ytDlp',
    name: 'yt-dlp',
    desc: 'Audio/Video streaming downloader executable',
    icon: 'i-lucide-download',
    placeholder: 'resources/yt-dlp.exe',
    path: '',
    verified: false,
    checking: false
  },
  {
    key: 'TOOLS_FFMPEG_PATH',
    type: 'ffmpeg',
    name: 'FFmpeg',
    desc: 'Complete cross-platform solution to record, convert and stream audio/video',
    icon: 'i-lucide-video',
    placeholder: 'resources/ffmpeg.exe',
    path: '',
    verified: false,
    checking: false
  },
  {
    key: 'TOOLS_FFPROBE_PATH',
    type: 'ffprobe',
    name: 'FFprobe',
    desc: 'Simple multimedia streams analyzer',
    icon: 'i-lucide-search',
    placeholder: 'resources/ffprobe.exe',
    path: '',
    verified: false,
    checking: false
  },
  {
    key: 'TOOLS_FFPLAY_PATH',
    type: 'ffplay',
    name: 'FFplay',
    desc: 'Media player using FFmpeg and SDL libraries',
    icon: 'i-lucide-play-square',
    placeholder: 'resources/ffplay.exe',
    path: '',
    verified: false,
    checking: false
  }
])

async function verifyTool(item: ToolItem) {
  if (!hasElectron.value) return
  if (!item.path) {
    item.verified = false
    return
  }
  item.checking = true
  try {
    const res = await window.electronAPI!.verifyPath(item.path, item.type)
    item.verified = !!res.status
  } catch {
    item.verified = false
  } finally {
    item.checking = false
  }
}

async function loadConfig() {
  if (!window.electronAPI) return
  loading.value = true
  try {
    const conf = await window.electronAPI.getConfig()
    for (const item of tools) {
      if (conf[item.key]) {
        item.path = conf[item.key]!
      }
    }
    await Promise.all(tools.map(item => verifyTool(item)))
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function onBrowse(item: ToolItem) {
  if (!window.electronAPI?.dialog) return
  try {
    const res = await window.electronAPI.dialog.openFile({
      title: `Select ${item.name} Executable`,
      filters: [{ name: 'Executable Files', extensions: ['exe', 'cmd', 'bat', 'sh'] }]
    })
    const selected = Array.isArray(res) ? res[0] : null
    if (selected) {
      item.path = selected
      await verifyTool(item)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    toast.add({ title: t('global.error'), description: msg, color: 'error' })
  }
}

async function onSave() {
  if (!window.electronAPI) return
  saving.value = true
  try {
    const values: Record<string, string> = {}
    for (const item of tools) {
      values[item.key] = item.path.trim()
    }
    await window.electronAPI.setConfig(values)
    await Promise.all(tools.map(item => verifyTool(item)))

    toast.add({
      title: t('global.success'),
      description: t('settings.toolsPathsSaved'),
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
  <div class="space-y-6">
    <!-- Header -->
    <UPageCard :title="t('settings.toolsBinaries')" :description="t('settings.toolsBinariesDesc')" variant="naked"
      orientation="horizontal">
      <div class="flex items-center gap-2 lg:ms-auto">
        <UButton color="primary" variant="soft" icon="i-lucide-save" :loading="saving"
          :label="t('settings.saveToolsPaths')" @click="onSave" />
      </div>
    </UPageCard>

    <!-- Tools List Cards -->
    <div class="space-y-4">
      <UPageCard v-for="item in tools" :key="item.key" variant="subtle"
        class="transition-all hover:border-gray-300 dark:hover:border-gray-700">
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
                  <UBadge size="xs" :color="item.verified ? 'success' : (item.path ? 'error' : 'neutral')"
                    variant="subtle">
                    <UIcon :name="item.verified ? 'i-lucide-check-circle-2' : 'i-lucide-alert-circle'"
                      class="size-3 mr-1" />
                    {{ item.verified ? t('settings.verified') : (item.path ? t('settings.binaryInvalid')
                      : t('settings.statusNotConfigured')) }}
                  </UBadge>
                </div>
                <p class="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {{ item.desc }}
                </p>
              </div>
            </div>
            <span
              class="text-[10px] font-mono uppercase tracking-wider text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
              {{ item.key }}
            </span>
          </div>

          <!-- Executable Path Input + Actions -->
          <div class="flex gap-2">
            <UInput v-model="item.path" class="flex-1 font-mono text-xs" :placeholder="item.placeholder"
              @change="verifyTool(item)" />
            <UButton size="sm" variant="soft" color="neutral" icon="i-lucide-folder-open"
              :label="t('settings.browseFile')" @click="onBrowse(item)" />
            <UButton size="sm" variant="soft" color="neutral" icon="i-lucide-check-circle" :loading="item.checking"
              :disabled="!item.path" :label="t('settings.testBinary')" @click="verifyTool(item)" />
          </div>
        </div>
      </UPageCard>
    </div>

    <!-- Instructions note -->
    <div
      class="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 text-xs space-y-2 text-gray-600 dark:text-gray-400">
      <div class="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-200">
        <UIcon name="i-lucide-info" class="size-4 text-primary" />
        <span>{{ t('settings.emptyForDefault') }}</span>
      </div>
      <p>
        Nếu bạn để trống đường dẫn, hệ thống sẽ tự động tìm kiếm các file nhị phân mặc định được đóng gói bên trong thư
        mục <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">resources/</code> của ứng dụng.
      </p>
    </div>
  </div>
</template>
