<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useFileSystem } from '~/composables/useFileSystem'
import { useTmcutMedia } from '~/composables/useTmcutMedia'
import { useTmcutAutocut } from '~/composables/useTmcutAutocut'
import type { AutocutProfile, AutocutAnalysis } from '~/composables/useTmcutAutocut'
import type { TmcutAsset } from '~/types/tmcut'
import { formatDurationSec } from '~/utils/tmcut/media'

const { t } = useI18n()
const toast = useToast()
const { pickFile, pickWebFiles } = useFileSystem()
const { assets, isDesktop, importFiles, importWebFiles, findAssetBySrc } = useTmcutMedia()
const { analyzing, stageKey, analysisError, analyzeSource, applyDraft } = useTmcutAutocut()

const currentStep = ref(1)
const selectedProfile = ref<AutocutProfile>('viral-shorts')
const sourceAsset = ref<TmcutAsset | null>(null)
const edlResult = ref<AutocutAnalysis | null>(null)
const included = ref<number[]>([])
const draftProjectId = ref<string | null>(null)
const applying = ref(false)

const sourceFilters = [
  { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpg', 'mpeg', 'ts', 'wmv', 'flv'] }
]

const steps = computed(() => [
  { step: 1, title: t('tmcut.steps.step1Title'), desc: t('tmcut.steps.step1Desc') },
  { step: 2, title: t('tmcut.steps.step2Title'), desc: t('tmcut.steps.step2Desc') },
  { step: 3, title: t('tmcut.steps.step3Title'), desc: t('tmcut.steps.step3Desc') },
  { step: 4, title: t('tmcut.steps.step4Title'), desc: t('tmcut.steps.step4Desc') }
])

const aiProfiles = computed(() => [
  { id: 'viral-shorts', name: t('tmcut.aiProfiles.viralShortsTitle'), desc: t('tmcut.aiProfiles.viralShortsDesc'), icon: 'i-lucide-zap' },
  { id: 'podcast-summary', name: t('tmcut.aiProfiles.podcastTitle'), desc: t('tmcut.aiProfiles.podcastDesc'), icon: 'i-lucide-mic' },
  { id: 'cinematic-vlog', name: t('tmcut.aiProfiles.vlogTitle'), desc: t('tmcut.aiProfiles.vlogDesc'), icon: 'i-lucide-film' }
])

const editorUrl = computed(() => `/tmcut/editor?project=${draftProjectId.value || ''}`)

const keptDuration = computed(() => {
  if (!edlResult.value) return 0
  return included.value.reduce((total, index) => {
    const segment = edlResult.value!.edl.segments[index]
    return total + (segment ? Math.max(0, segment.end - segment.start) : 0)
  }, 0)
})

function pickSourceAsset(paths: string[]): TmcutAsset | null {
  for (const filePath of paths) {
    const asset = findAssetBySrc(filePath)
    if (asset && asset.kind === 'video' && asset.status === 'ready') return asset
  }
  return null
}

// Step 1: import files, keep the first ready video as the analysis source.
async function handleChooseFromDevice() {
  if (!isDesktop.value) {
    const files = await pickWebFiles(sourceFilters.flatMap(group => group.extensions), true)
    if (files.length === 0) return
    const imported = await importWebFiles(files)
    if (imported.length > 0) {
      toast.add({ title: `${t('global.success')}: ${imported.length}`, color: 'success' })
    }
    const source = imported.find(asset => asset.kind === 'video' && asset.status === 'ready') || null
    if (!source) {
      toast.add({ title: t('tmcut.steps.noSource'), color: 'warning' })
      return
    }
    sourceAsset.value = source
    currentStep.value = 2
    return
  }
  let paths: string[] = []
  try {
    const picked = await pickFile({
      title: t('tmcut.steps.chooseFromDevice'),
      filters: sourceFilters,
      multiSelections: true
    })
    paths = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (paths.length === 0) return
    const result = await importFiles(paths)
    if (result.added > 0) {
      toast.add({ title: `${t('global.success')}: ${result.added}`, color: 'success' })
    }
    if (result.duplicates > 0) {
      toast.add({ title: t('tmcut.media.alreadyInLibrary'), color: 'info' })
    }
    if (result.failed > 0) {
      toast.add({ title: t('tmcut.media.analysisFailed'), color: 'error' })
    }
  } catch (error) {
    console.error('Media import failed:', error)
    toast.add({ title: t('tmcut.media.importFailed'), color: 'error' })
  }
  const source = pickSourceAsset(paths)
  if (!source) {
    toast.add({ title: t('tmcut.steps.noSource'), color: 'warning' })
    return
  }
  sourceAsset.value = source
  currentStep.value = 2
}

function handleChooseFromMedia() {
  const ready = assets.value
    .filter(asset => asset.kind === 'video' && asset.status === 'ready')
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
  if (ready.length === 0 || !ready[0]) {
    toast.add({ title: t('tmcut.steps.noSource'), color: 'warning' })
    return
  }
  sourceAsset.value = ready[0]
  currentStep.value = 2
}

async function startAnalysis() {
  if (!sourceAsset.value) return
  currentStep.value = 3
  const result = await analyzeSource(sourceAsset.value, selectedProfile.value)
  if (!result) return
  edlResult.value = result
  included.value = result.edl.segments.map((_, index) => index)
}

function toggleSegment(index: number) {
  const position = included.value.indexOf(index)
  if (position === -1) included.value.push(index)
  else included.value.splice(position, 1)
}

function formatRange(start: number, end: number): string {
  return `${formatDurationSec(start)} - ${formatDurationSec(end)}`
}

async function handleAccept() {
  if (!sourceAsset.value || !edlResult.value || included.value.length === 0 || applying.value) return
  applying.value = true
  try {
    const profile = aiProfiles.value.find(item => item.id === selectedProfile.value)
    const name = `${sourceAsset.value.name} (${profile?.name || selectedProfile.value})`
    const id = await applyDraft(sourceAsset.value, edlResult.value.edl, included.value, name)
    if (!id) {
      toast.add({ title: t('tmcut.steps.noSegments'), color: 'warning' })
      return
    }
    draftProjectId.value = id
    currentStep.value = 4
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <BasePage id="tmcut-autocut" :title="t('nav.tmcut_autocut')" :description="t('tmcut.autocutDesc')">
    <template #right>
      <UButton to="/tmcut" icon="i-lucide-arrow-left" variant="soft" color="neutral" size="sm">
        <span class="hidden sm:inline">{{ t('tmcut.back') }}</span>
      </UButton>
    </template>

    <div class="space-y-6 max-w-5xl">
      <!-- Stepper Indicator -->
      <div class="grid grid-cols-4 gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div v-for="s in steps" :key="s.step" class="flex flex-col border-t-2 pt-2 transition"
          :class="currentStep >= s.step ? 'border-primary text-primary' : 'border-neutral-200 dark:border-neutral-800 text-neutral-400'">
          <span class="text-xs font-semibold">{{ t('tmcut.steps.step', { step: s.step }) }}</span>
          <span class="text-xs font-medium truncate text-neutral-900 dark:text-neutral-100">{{ s.title }}</span>
        </div>
      </div>

      <!-- Step 1: Upload Source -->
      <div v-if="currentStep === 1" class="space-y-4">
        <div
          class="border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-2xl p-12 text-center bg-neutral-50 dark:bg-neutral-900/50">
          <UIcon name="i-lucide-upload-cloud" class="w-12 h-12 text-primary mx-auto mb-3" />
          <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {{ t('tmcut.steps.dragDrop') }}
          </h3>
          <p class="text-xs text-neutral-500 max-w-md mx-auto mt-1 mb-4">
            {{ t('tmcut.steps.dragDropDesc') }}
          </p>
          <div class="flex justify-center gap-3">
            <UButton icon="i-lucide-file-video" color="primary" variant="soft" @click="handleChooseFromDevice">
              {{ t('tmcut.steps.chooseFromDevice') }}
            </UButton>
            <UButton icon="i-lucide-cloud" variant="soft" color="neutral" @click="handleChooseFromMedia">
              {{ t('tmcut.steps.chooseFromMedia') }}
            </UButton>
          </div>
        </div>

        <div v-if="sourceAsset" class="flex items-center gap-2 text-xs text-neutral-400">
          <UIcon name="i-lucide-file-video" class="w-4 h-4 text-primary" />
          <span class="truncate">{{ sourceAsset.name }}</span>
        </div>

        <div class="flex justify-end">
          <UButton color="primary" variant="solid" :disabled="!sourceAsset" @click="currentStep = 2">
            {{ t('tmcut.steps.continueStep2') }}
          </UButton>
        </div>
      </div>

      <!-- Step 2: Choose AI Profile -->
      <div v-else-if="currentStep === 2" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div v-for="prof in aiProfiles" :key="prof.id"
            class="border-2 rounded-xl p-5 cursor-pointer transition flex flex-col justify-between"
            :class="selectedProfile === prof.id ? 'border-primary bg-primary/5' : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300'"
            @click="selectedProfile = prof.id as AutocutProfile">
            <div class="space-y-2">
              <UIcon :name="prof.icon" class="w-6 h-6 text-primary" />
              <h4 class="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                {{ prof.name }}
              </h4>
              <p class="text-xs text-neutral-500">
                {{ prof.desc }}
              </p>
            </div>
          </div>
        </div>

        <div class="flex justify-between pt-4">
          <UButton variant="soft" color="neutral" @click="currentStep = 1">
            {{ t('tmcut.back') }}
          </UButton>
          <UButton color="primary" variant="solid" :disabled="!sourceAsset" @click="startAnalysis">
            {{ t('tmcut.steps.analyzeEdl') }}
          </UButton>
        </div>
      </div>

      <!-- Step 3: Analyze + Review EDL -->
      <div v-else-if="currentStep === 3" class="space-y-4">
        <!-- Analyzing state -->
        <div v-if="analyzing"
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-8 text-center bg-neutral-50 dark:bg-neutral-900/50">
          <UIcon name="i-lucide-loader-circle" class="w-10 h-10 text-primary mx-auto mb-3 animate-spin" />
          <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {{ t('tmcut.steps.analyzing') }}
          </h3>
          <p class="text-xs text-neutral-500 mt-1">
            {{ stageKey ? t(stageKey) : '' }}
          </p>
        </div>

        <!-- Error state -->
        <div v-else-if="analysisError" class="border border-red-500/40 bg-red-950/30 rounded-xl p-6 text-center">
          <UIcon name="i-lucide-alert-triangle" class="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p class="text-sm font-medium text-red-200">
            {{ t('tmcut.steps.analyzeFailed') }}
          </p>
          <p class="text-xs text-red-300/70 font-mono mt-1 break-all">
            {{ analysisError === 'desktop-only' ? t('tmcut.media.desktopOnly') : analysisError }}
          </p>
          <div class="flex justify-center gap-3 mt-4">
            <UButton variant="soft" color="neutral" @click="currentStep = 2">
              {{ t('tmcut.back') }}
            </UButton>
            <UButton color="primary" variant="solid" @click="startAnalysis">
              {{ t('tmcut.steps.retry') }}
            </UButton>
          </div>
        </div>

        <!-- Review state -->
        <div v-else-if="edlResult" class="space-y-4">
          <div
            class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 bg-neutral-50 dark:bg-neutral-900/50">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <UBadge color="primary" variant="soft">
                {{ t('tmcut.steps.keptInfo', { count: included.length, duration: formatDurationSec(keptDuration) }) }}
              </UBadge>
              <UBadge color="neutral" variant="soft">
                {{ edlResult.sceneCount }} segments
              </UBadge>
              <UBadge :color="edlResult.transcriptUsed ? 'success' : 'neutral'" variant="soft">
                {{ edlResult.transcriptUsed ? t('tmcut.steps.transcriptOn') : t('tmcut.steps.transcriptOff') }}
              </UBadge>
            </div>
            <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mt-3">
              {{ t('tmcut.steps.reviewTitle') }}
            </h3>
          </div>

          <div v-if="edlResult.edl.segments.length === 0"
            class="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-8 text-center">
            <p class="text-sm text-neutral-500">
              {{ t('tmcut.steps.noSegments') }}
            </p>
          </div>

          <div v-else class="space-y-2 max-h-96 overflow-y-auto pr-1">
            <div v-for="(segment, index) in edlResult.edl.segments" :key="index"
              class="flex items-center gap-3 border rounded-lg p-3 transition cursor-pointer" :class="included.includes(index)
                ? 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900'
                : 'border-neutral-200 dark:border-neutral-800 opacity-50'" @click="toggleSegment(index)">
              <UCheckbox :model-value="included.includes(index)" @click.stop />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-mono text-neutral-900 dark:text-neutral-100">
                    {{ formatRange(segment.start, segment.end) }}
                  </span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                    {{ segment.reason }}
                  </span>
                </div>
                <div class="h-1.5 mt-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                  <div class="h-full rounded-full"
                    :class="segment.score >= 0.5 ? 'bg-emerald-500' : segment.score >= 0.25 ? 'bg-amber-500' : 'bg-red-500'"
                    :style="{ width: `${Math.round(segment.score * 100)}%` }" />
                </div>
              </div>
              <span class="text-[11px] font-mono text-neutral-500 w-10 text-right shrink-0">
                {{ segment.score.toFixed(2) }}
              </span>
            </div>
          </div>

          <div class="flex justify-between pt-4">
            <UButton variant="soft" color="neutral" @click="currentStep = 2">
              {{ t('tmcut.back') }}
            </UButton>
            <div class="flex gap-3">
              <UButton variant="soft" color="neutral" @click="startAnalysis">
                {{ t('tmcut.steps.retry') }}
              </UButton>
              <UButton color="primary" variant="solid" icon="i-lucide-clapperboard"
                :disabled="included.length === 0 || applying" :loading="applying" @click="handleAccept">
                {{ t('tmcut.steps.acceptDraft') }}
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 4: Done -->
      <div v-else-if="currentStep === 4" class="space-y-4">
        <div class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 bg-neutral-900 text-neutral-100">
          <div class="flex items-center gap-2 text-primary font-semibold text-sm mb-4">
            <UIcon name="i-lucide-check-circle" class="w-5 h-5" />
            {{ t('tmcut.steps.edlDoneTitle') }}
          </div>
          <p class="text-xs text-neutral-400">
            {{ t('tmcut.steps.edlDoneDesc') }}
          </p>
        </div>

        <div class="flex justify-between pt-4">
          <UButton variant="soft" color="neutral" @click="currentStep = 3">
            {{ t('tmcut.back') }}
          </UButton>
          <UButton color="primary" variant="solid" icon="i-lucide-clapperboard" :to="editorUrl">
            {{ t('tmcut.steps.openInEditor') }}
          </UButton>
        </div>
      </div>
    </div>
  </BasePage>
</template>
