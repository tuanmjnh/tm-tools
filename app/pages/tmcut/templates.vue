<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { normalizeCanvas } from '~/utils/tmcut/canvas'

const { t } = useI18n()
const router = useRouter()
const { createProject } = useTmcutProject()

const presets = computed(() => [
  {
    id: 'preset-shorts-vertical',
    name: t('tmcut.presets.shortsName'),
    description: t('tmcut.presets.shortsDesc'),
    canvas: '1080x1920',
    fps: 30,
    icon: 'i-lucide-smartphone'
  },
  {
    id: 'preset-youtube-horizontal',
    name: t('tmcut.presets.youtubeName'),
    description: t('tmcut.presets.youtubeDesc'),
    canvas: '1920x1080',
    fps: 30,
    icon: 'i-lucide-monitor'
  },
  {
    id: 'preset-instagram-feed',
    name: t('tmcut.presets.instagramName'),
    description: t('tmcut.presets.instagramDesc'),
    canvas: '1080x1080',
    fps: 30,
    icon: 'i-lucide-square'
  }
])

function applyPreset(preset: { canvas: string, name: string, fps: number }) {
  const parts = preset.canvas.split('x').map(Number)
  const w = parts[0] || 1920
  const h = parts[1] || 1080
  const project = createProject(`${t('tmcut.project')} ${preset.name}`)
  project.canvas = normalizeCanvas({ width: w, height: h, fps: preset.fps })
  router.push(`/tmcut/editor?project=${project.id}`)
}
</script>

<template>
  <BasePage id="tmcut-templates" :title="t('nav.tmcut_templates')" :description="t('tmcut.templatesDesc')">
    <template #right>
      <UButton to="/tmcut" icon="i-lucide-arrow-left" variant="soft" color="neutral" size="sm">
        <span class="hidden sm:inline">{{ t('tmcut.back') }}</span>
      </UButton>
    </template>

    <!-- Presets Grid -->
    <div class="space-y-4">
      <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {{ t('tmcut.presetSizes') }}
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div v-for="p in presets" :key="p.id"
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 bg-white dark:bg-neutral-900 flex flex-col justify-between hover:border-primary/50 transition cursor-pointer"
          @click="applyPreset(p)">
          <div class="space-y-3">
            <div class="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <UIcon :name="p.icon" class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-medium text-base text-neutral-900 dark:text-neutral-100">
                {{ p.name }}
              </h3>
              <p class="text-xs text-neutral-500 mt-1">
                {{ p.description }}
              </p>
            </div>
          </div>

          <div class="mt-6 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <span class="text-xs font-mono text-neutral-400">{{ p.canvas }} ({{ p.fps }}fps)</span>
            <UButton size="xs" color="primary" variant="soft">
              {{ t('tmcut.apply') }}
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </BasePage>
</template>
