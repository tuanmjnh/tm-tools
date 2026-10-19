<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useFileSystem } from '~/composables/useFileSystem'
import { useTmcutMedia } from '~/composables/useTmcutMedia'
import { useTmcutAutocut } from '~/composables/useTmcutAutocut'
import type { AutocutProfile, AutocutAnalysis } from '~/composables/useTmcutAutocut'
import type { TmcutAsset } from '~/types/tmcut'
import { formatDurationSec } from '~/utils/tmcut/media'
import { toURL } from '~/utils/ffmpegHelper'
import { AUTOCUT_PREFS_KEY, AUTOCUT_PREFS_DEFAULT, parseAutocutPrefs, serializeAutocutPrefs, splitKeywords, joinKeywords } from '~/utils/tmcut/autocutPrefs'
import { nextActiveIndex } from '~/utils/tmcut/autocutReview'

const { t } = useI18n()
const toast = useToast()
const { pickFile, pickWebFiles } = useFileSystem()
const { assets, isDesktop, importFiles, importWebFiles, findAssetBySrc, getThumbUrl, mediaUrl } = useTmcutMedia()
const { analyzing, stageKey, analysisError, analyzeSource, applyDraft } = useTmcutAutocut()
const { available: canExtractFrames, extractFrames } = useTmcutFrames()

// AutoCut v2: transcript vocabulary analysis options.
// hydrate from sanitized localStorage prefs, persist on change. All
// parsing/clamping lives in autocutPrefs.ts (unit-tested); the page
// only reads and writes strings.
const currentStep = ref(1)
const savedPrefs = import.meta.client
  ? parseAutocutPrefs(localStorage.getItem(AUTOCUT_PREFS_KEY))
  : { ...AUTOCUT_PREFS_DEFAULT }
const selectedProfile = ref<AutocutProfile>(savedPrefs.profile)
const sourceAsset = ref<TmcutAsset | null>(null)
const edlResult = ref<AutocutAnalysis | null>(null)
const included = ref<number[]>([])
const draftProjectId = ref<string | null>(null)
const applying = ref(false)

const filterFillerWords = ref(savedPrefs.filterFillerWords)
const aiAnalysis = ref(savedPrefs.aiAnalysis)
// R135: how far the triage opinion pulls the local score (core clamps
// 0..0.5). The default/ceiling constants come from autocutPrefs.ts,
// pinned to the core contract by tmcut_autocut_prefs.spec.
const aiWeight = ref(savedPrefs.aiWeight)
const highlightKeywordsText = ref(savedPrefs.keywordsText)
// R137: chip editor over the persisted comma-separated string (the
// storage shape is unchanged — chips are a view, tokens split/deduped
// by the unit-tested helpers). Case-insensitive dedup keeps the first
// spelling the user typed.
const keywordChips = computed(() => splitKeywords(highlightKeywordsText.value))
const keywordDraft = ref('')
function commitKeywordDraft() {
  const words = keywordDraft.value
  if (!words.trim()) return
  keywordDraft.value = ''
  highlightKeywordsText.value = joinKeywords([...keywordChips.value, ...words.split(',')])
}
function removeKeywordChip(word: string) {
  keywordDraft.value = ''
  highlightKeywordsText.value = joinKeywords(keywordChips.value.filter(chip => chip !== word))
}
function onKeywordDraftKeydown(event: KeyboardEvent) {
  // Enter or a typed comma commits the draft (the comma is consumed —
  // it would otherwise land in the draft text as a separator).
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    commitKeywordDraft()
  } else if (event.key === 'Backspace' && !keywordDraft.value && keywordChips.value.length > 0) {
    removeKeywordChip(keywordChips.value[keywordChips.value.length - 1]!)
  }
}
const highlightKeywords = keywordChips

watch([selectedProfile, filterFillerWords, aiAnalysis, aiWeight, highlightKeywordsText], () => {
  if (!import.meta.client) return
  try {
    localStorage.setItem(AUTOCUT_PREFS_KEY, serializeAutocutPrefs({
      profile: selectedProfile.value,
      filterFillerWords: filterFillerWords.value,
      aiAnalysis: aiAnalysis.value,
      aiWeight: aiWeight.value,
      keywordsText: highlightKeywordsText.value
    }))
  } catch {
    // Private-mode / quota: persistence is a convenience, never an error.
  }
}, { deep: false })

// Mini-review player state (design #4 right panel)
const activeSegmentIndex = ref<number | null>(null)
const reviewTime = ref(0)
const reviewPlaying = ref(false)
const reviewVideo = ref<HTMLVideoElement | null>(null)

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

// ===== Review metrics (all derived from the real analysis result) =====

const segments = computed(() => edlResult.value?.edl.segments ?? [])
const segmentCount = computed(() => segments.value.length)
const sourceDuration = computed(() => edlResult.value?.sourceDurationSec || 0)

const compressionPct = computed(() => {
  if (sourceDuration.value <= 0) return 0
  return Math.max(0, Math.round((1 - keptDuration.value / sourceDuration.value) * 100))
})

const avgScore = computed(() => {
  if (segments.value.length === 0) return 0
  const total = segments.value.reduce((sum, segment) => sum + segment.score, 0)
  return Math.round((total / segments.value.length) * 100)
})

const speechPct = computed(() => {
  if (!edlResult.value || sourceDuration.value <= 0) return 0
  return Math.min(100, Math.round((edlResult.value.speechSec / sourceDuration.value) * 100))
})

const fillerCount = computed(() => edlResult.value?.fillerSegmentCount || 0)
const highlightCount = computed(() => edlResult.value?.highlightSegmentCount || 0)

// Real transcript text per segment (overlapping Whisper lines are joined)
const transcriptLines = computed(() => segments.value.map((segment) => {
  const parts = (edlResult.value?.transcript ?? [])
    .filter(part => part.text && part.start < segment.end && part.end > segment.start)
    .map(part => (part.text || '').trim())
    .filter(Boolean)
  return parts.join(' ')
}))

const activeSegment = computed(() => {
  const index = activeSegmentIndex.value
  return index === null ? null : (segments.value[index] ?? null)
})

const reviewProgress = computed(() => {
  const segment = activeSegment.value
  if (!segment) return 0
  const span = segment.end - segment.start
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, ((reviewTime.value - segment.start) / span) * 100))
})

const sourceVideoUrl = computed(() => (sourceAsset.value ? toURL(sourceAsset.value.path) : ''))
const sourceThumbUrl = computed(() => (sourceAsset.value ? getThumbUrl(sourceAsset.value) : ''))

function scoreBarClass(score: number): string {
  if (score >= 0.7) return 'bg-emerald-500'
  if (score >= 0.4) return 'bg-amber-500'
  return 'bg-red-500'
}

function scoreBadgeClass(score: number): string {
  if (score >= 0.7) return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
  if (score >= 0.4) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  return 'bg-red-500/15 text-red-600 dark:text-red-400'
}

// ===== Source picking (step 1) =====

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

// ===== Analysis (step 3) =====

// Per-segment thumbnails (roadmap G-1, core C14 plans the timestamps):
// one cached still per segment at its representative time (EDL thumb,
// falling back to the midpoint), extracted with bounded concurrency.
// Web sessions keep the shared source poster (no IPC there).
const segmentThumbs = ref<Record<number, string>>({})
let thumbRequest = 0

async function loadSegmentThumbs() {
  const asset = sourceAsset.value
  const result = edlResult.value
  if (!asset || !result || !canExtractFrames.value) return
  const request = ++thumbRequest
  segmentThumbs.value = {}
  const jobs = result.edl.segments.map((segment, index) => ({
    id: index,
    src: asset.path,
    atSec: Number.isFinite(segment.thumb) ? Number(segment.thumb) : (segment.start + segment.end) / 2,
    width: 224
  }))
  const frames = await extractFrames(jobs)
  if (request !== thumbRequest) return // a newer analysis superseded this batch
  const next: Record<number, string> = {}
  frames.forEach((path, id) => {
    // extractFrames returns cache file paths; display needs the
    // privileged media:// URL builder (mediaUrl → toURL).
    next[Number(id)] = mediaUrl(path)
  })
  segmentThumbs.value = next
}

async function startAnalysis() {
  if (!sourceAsset.value) return
  currentStep.value = 3
  activeSegmentIndex.value = null
  reviewTime.value = 0
  const result = await analyzeSource(sourceAsset.value, selectedProfile.value, {
    filterFillerWords: filterFillerWords.value,
    highlightKeywords: highlightKeywords.value,
    aiAnalysis: aiAnalysis.value,
    aiWeight: aiWeight.value
  })
  if (!result) return
  edlResult.value = result
  included.value = result.edl.segments.map((_, index) => index)
  activeSegmentIndex.value = result.edl.segments.length > 0 ? 0 : null
  void loadSegmentThumbs()
}

// Re-score with another profile (real re-run of the analysis pipeline)
function rescoreWith(profile: AutocutProfile) {
  if (analyzing.value) return
  selectedProfile.value = profile
  void startAnalysis()
}

function toggleInclude(index: number) {
  const position = included.value.indexOf(index)
  if (position === -1) included.value.push(index)
  else included.value.splice(position, 1)
}

function bulkSelectAll() {
  included.value = segments.value.map((_, index) => index)
}

function bulkSelectHigh() {
  included.value = segments.value
    .map((segment, index) => (segment.score >= 0.7 ? index : -1))
    .filter(index => index !== -1)
}

function bulkDeselectFillers() {
  included.value = included.value.filter((index) => {
    const segment = segments.value[index]
    return !(segment?.hasFillerWords || segment?.reason === 'filler-word')
  })
}

function bulkSelectHighlights() {
  included.value = segments.value
    .map((segment, index) => (segment.isHighlight || segment.reason === 'highlight' ? index : -1))
    .filter(index => index !== -1)
}

function formatRange(start: number, end: number): string {
  return `${formatDurationSec(start)} - ${formatDurationSec(end)}`
}

// ===== Mini-review player =====

function selectSegment(index: number, autoplay = false) {
  activeSegmentIndex.value = index
  const segment = segments.value[index]
  const video = reviewVideo.value
  if (!segment || !video) return
  video.currentTime = segment.start
  reviewTime.value = segment.start
  if (autoplay) video.play().catch(() => { })
}

function onReviewLoadedMetadata() {
  const segment = activeSegment.value
  const video = reviewVideo.value
  if (segment && video) video.currentTime = segment.start
}

function onReviewTimeUpdate() {
  const video = reviewVideo.value
  const segment = activeSegment.value
  if (!video || !segment) return
  reviewTime.value = video.currentTime
  // Stop exactly at the segment out point (mini-review loop bound)
  if (video.currentTime >= segment.end) video.pause()
}

function toggleReviewPlay() {
  const video = reviewVideo.value
  const segment = activeSegment.value
  if (!video || !segment) return
  if (video.paused) {
    if (video.currentTime >= segment.end || video.currentTime < segment.start) {
      video.currentTime = segment.start
    }
    video.play().catch(() => { })
  } else {
    video.pause()
  }
}

function nudgeReview(deltaSec: number) {
  const video = reviewVideo.value
  if (!video) return
  video.currentTime = Math.max(0, video.currentTime + deltaSec)
}

function seekReview(event: MouseEvent) {
  const segment = activeSegment.value
  const video = reviewVideo.value
  if (!segment || !video) return
  const track = event.currentTarget as HTMLElement
  const rect = track.getBoundingClientRect()
  const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0
  video.currentTime = segment.start + (segment.end - segment.start) * Math.min(1, Math.max(0, ratio))
  reviewTime.value = video.currentTime
}

// ===== Step-3 keyboard review (docs §202, R138) =====
// Click-only review forced 60 mouse hits on a 60-segment EDL. Same
// window-listener pattern as the editor (R124): typing fields stay
// inert, no modifier combos are claimed, and the next-index decision
// lives in the pure, unit-tested nextActiveIndex (no wrapping — the
// ends of the list are hard stops, wrapping silently teleports the
// reviewer across the timeline).
const listRef = ref<HTMLElement | null>(null)
function scrollToActiveSegment() {
  const list = listRef.value
  const active = activeSegmentIndex.value
  const row = list?.children[active ?? -1] as HTMLElement | undefined
  // scrollIntoView(block:'nearest') no-ops when the row is already fully
  // visible — no jarring re-centering while stepping through rows.
  row?.scrollIntoView({ block: 'nearest' })
}

function onReviewKeydown(event: KeyboardEvent) {
  if (currentStep.value !== 3 || analyzing.value) return
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO'].includes(target.tagName)) return
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const count = segments.value.length
  if (count === 0) return
  let handled = true
  switch (event.key) {
    case 'ArrowDown':
      selectSegment(nextActiveIndex(activeSegmentIndex.value, count, 1)!)
      scrollToActiveSegment()
      break
    case 'ArrowUp':
      selectSegment(nextActiveIndex(activeSegmentIndex.value, count, -1)!)
      scrollToActiveSegment()
      break
    case ' ': {
      const active = activeSegmentIndex.value
      if (active !== null) toggleInclude(active)
      break
    }
    case 'Enter': {
      const active = activeSegmentIndex.value
      if (active !== null) selectSegment(active, true)
      break
    }
    default:
      handled = false
  }
  if (handled) event.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onReviewKeydown))

onUnmounted(() => {
  reviewVideo.value?.pause()
  window.removeEventListener('keydown', onReviewKeydown)
})

// ===== Accept draft (step 4) =====

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
      <UButton
        to="/tmcut"
        icon="i-lucide-arrow-left"
        variant="soft"
        color="neutral"
        size="sm"
      >
        <span class="hidden sm:inline">{{ t('tmcut.back') }}</span>
      </UButton>
    </template>

    <div class="space-y-4 max-w-7xl">
      <!-- Stepper breadcrumb (design #4) -->
      <div class="flex items-center gap-3 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <template v-for="(s, index) in steps" :key="s.step">
          <div
            class="flex items-center gap-2 shrink-0 transition"
            :class="currentStep === s.step
              ? 'bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-xl shadow-sm'
              : currentStep > s.step ? 'opacity-80 hover:opacity-100' : 'opacity-40'"
          >
            <div
              class="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
              :class="currentStep > s.step
                ? 'bg-primary/20 text-primary'
                : currentStep === s.step
                  ? 'bg-primary text-neutral-900 shadow-[0_0_10px_rgba(var(--ui-primary),0.4)]'
                  : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400'"
            >
              <UIcon v-if="currentStep > s.step" name="i-lucide-check" class="w-3 h-3" />
              <span v-else class="text-[11px] font-semibold">{{ s.step }}</span>
            </div>
            <div class="flex flex-col">
              <span
                class="text-[10px] uppercase tracking-wider"
                :class="currentStep === s.step ? 'text-primary font-semibold' : 'text-neutral-400'"
              >
                {{ t('tmcut.steps.step', { step: s.step }) }}
              </span>
              <span
                class="text-xs font-medium whitespace-nowrap"
                :class="currentStep === s.step ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'"
              >
                {{ s.title }}
              </span>
            </div>
          </div>
          <UIcon
            v-if="index < steps.length - 1"
            name="i-lucide-chevron-right"
            class="w-4 h-4 text-neutral-400 shrink-0"
          />
        </template>

        <!-- Honest status chips: real analyzer version + real average score
             (the mockup's "Neural Engine v3.1 / Confidence 97.8%" is fake) -->
        <div v-if="edlResult" class="hidden lg:flex items-center gap-2 ml-auto shrink-0">
          <span class="px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 font-mono text-[11px] text-neutral-500">
            {{ t('tmcut.wizard.analyzer') }} {{ edlResult.edl.analyzerVersion }}
          </span>
          <span class="px-2 py-1 rounded-lg bg-primary/10 font-mono text-[11px] text-primary font-semibold">
            {{ t('tmcut.wizard.avgScore', { pct: avgScore }) }}
          </span>
          <!-- Only when a triage pass ACTUALLY returned opinions (§194) -->
          <span
            v-if="edlResult.aiAnalysisUsed"
            class="px-2 py-1 rounded-lg bg-sky-500/10 font-mono text-[11px] text-sky-500 font-semibold"
          >
            {{ t('tmcut.autocutV2.aiBadge', { count: edlResult.aiItems.length }) }}
          </span>
        </div>
      </div>

      <!-- Step 1: Upload Source -->
      <div v-if="currentStep === 1" class="space-y-4">
        <div
          class="border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-2xl p-12 text-center bg-neutral-50 dark:bg-neutral-900/50"
        >
          <UIcon name="i-lucide-upload-cloud" class="w-12 h-12 text-primary mx-auto mb-3" />
          <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {{ t('tmcut.steps.dragDrop') }}
          </h3>
          <p class="text-xs text-neutral-500 max-w-md mx-auto mt-1 mb-4">
            {{ t('tmcut.steps.dragDropDesc') }}
          </p>
          <div class="flex justify-center gap-3">
            <UButton
              icon="i-lucide-file-video"
              color="primary"
              variant="soft"
              @click="handleChooseFromDevice"
            >
              {{ t('tmcut.steps.chooseFromDevice') }}
            </UButton>
            <UButton
              icon="i-lucide-cloud"
              variant="soft"
              color="neutral"
              @click="handleChooseFromMedia"
            >
              {{ t('tmcut.steps.chooseFromMedia') }}
            </UButton>
          </div>
        </div>

        <div v-if="sourceAsset" class="flex items-center gap-2 text-xs text-neutral-400">
          <UIcon name="i-lucide-file-video" class="w-4 h-4 text-primary" />
          <span class="truncate">{{ sourceAsset.name }}</span>
        </div>

        <div class="flex justify-end">
          <UButton
            color="primary"
            variant="solid"
            :disabled="!sourceAsset"
            @click="currentStep = 2"
          >
            {{ t('tmcut.steps.continueStep2') }}
          </UButton>
        </div>
      </div>

      <!-- Step 2: Choose AI Profile -->
      <div v-else-if="currentStep === 2" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            v-for="prof in aiProfiles"
            :key="prof.id"
            class="border-2 rounded-xl p-5 cursor-pointer transition flex flex-col justify-between"
            :class="selectedProfile === prof.id ? 'border-primary bg-primary/5' : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300'"
            @click="selectedProfile = prof.id as AutocutProfile"
          >
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

        <!-- AutoCut v2: Vocabulary & Filler Words Card -->
        <div
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-neutral-50 dark:bg-neutral-900/60 space-y-4"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary">
                <UIcon name="i-lucide-sparkles" class="w-4 h-4" />
              </div>
              <h4 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {{ t('tmcut.autocutV2.title') }}
              </h4>
            </div>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">
              {{ t('tmcut.autocutV2.badge') }}
            </span>
          </div>

          <p class="text-xs text-neutral-500">
            {{ t('tmcut.autocutV2.desc') }}
          </p>

          <div class="space-y-3 pt-1">
            <!-- Toggle Filler Words -->
            <div
              class="flex items-center justify-between gap-4 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
            >
              <div class="space-y-0.5">
                <div class="flex items-center gap-1.5">
                  <UIcon name="i-lucide-filter-x" class="w-4 h-4 text-amber-500" />
                  <span class="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                    {{ t('tmcut.autocutV2.filterFillerLabel') }}
                  </span>
                </div>
                <p class="text-[11px] text-neutral-500">
                  {{ t('tmcut.autocutV2.filterFillerDesc') }}
                </p>
              </div>
              <USwitch v-model="filterFillerWords" />
            </div>

            <!-- AI content triage (docs §194) — runs on the `triage` task
                 provider, blends opinions into segment scores (opt-in). -->
            <div
              class="flex items-center justify-between gap-4 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
            >
              <div class="space-y-0.5">
                <div class="flex items-center gap-1.5">
                  <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-sky-500" />
                  <span class="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                    {{ t('tmcut.autocutV2.aiAnalysisLabel') }}
                  </span>
                </div>
                <p class="text-[11px] text-neutral-500">
                  {{ t('tmcut.autocutV2.aiAnalysisDesc') }}
                </p>
              </div>
              <USwitch v-model="aiAnalysis" />
            </div>

            <!-- R135: triage blend weight. Core clamps the pull to 0..0.5
                 ("AI is an opinion, not truth") — the slider max matches,
                 so the UI cannot promise more influence than the engine
                 allows. 0 skips the triage call entirely (see composable). -->
            <div
              v-if="aiAnalysis"
              class="space-y-2 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                  {{ t('tmcut.autocutV2.aiWeightLabel') }}
                </span>
                <span class="text-[11px] tabular-nums text-neutral-500">
                  {{ Math.round(aiWeight * 100) }}%
                </span>
              </div>
              <USlider
                v-model="aiWeight"
                :min="0"
                :max="0.5"
                :step="0.05"
              />
              <p class="text-[10px] text-neutral-400">
                {{ t('tmcut.autocutV2.aiWeightDesc') }}
              </p>
            </div>

            <!-- Priority Keywords Input -->
            <div
              class="space-y-1.5 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5">
                  <UIcon name="i-lucide-tag" class="w-4 h-4 text-purple-500" />
                  <span class="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                    {{ t('tmcut.autocutV2.keywordsLabel') }}
                  </span>
                </div>
                <span class="text-[10px] text-neutral-400">
                  {{ t('tmcut.autocutV2.keywordsOptional') }}
                </span>
              </div>
              <!-- R137: chips + inline draft input replace the raw comma
                   box. Enter / comma commits (paste of "a,b,c" splits via
                   the same joinKeywords pipeline), Backspace on an empty
                   draft drops the last chip, X removes any chip. The
                   persisted shape stays the comma string (watch below). -->
              <div
                class="flex flex-wrap items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
              >
                <span
                  v-for="chip in keywordChips"
                  :key="chip"
                  class="inline-flex items-center gap-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 text-[11px] font-medium"
                >
                  {{ chip }}
                  <button
                    type="button"
                    class="hover:text-purple-800 dark:hover:text-purple-200"
                    :aria-label="t('tmcut.autocutV2.removeKeywordAria', { word: chip })"
                    @click="removeKeywordChip(chip)"
                  >
                    <UIcon name="i-lucide-x" class="w-3 h-3" />
                  </button>
                </span>
                <input
                  v-model="keywordDraft"
                  type="text"
                  class="flex-1 min-w-24 bg-transparent text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
                  :placeholder="keywordChips.length ? '' : t('tmcut.autocutV2.keywordsPlaceholder')"
                  :aria-label="t('tmcut.autocutV2.keywordsLabel')"
                  @keydown="onKeywordDraftKeydown"
                  @blur="commitKeywordDraft"
                >
              </div>
              <p class="text-[10px] text-neutral-400">
                {{ t('tmcut.autocutV2.keywordsHelp') }}
              </p>
            </div>
          </div>
        </div>

        <!-- AI connection for this surface: transcription can run on its own
             provider (AI_*_TRANSCRIBE slots), independent of the editor AI. -->
        <TmcutAiConnect />

        <div class="flex justify-between pt-4">
          <UButton variant="soft" color="neutral" @click="currentStep = 1">
            {{ t('tmcut.back') }}
          </UButton>
          <UButton
            color="primary"
            variant="solid"
            :disabled="!sourceAsset"
            @click="startAnalysis"
          >
            {{ t('tmcut.steps.analyzeEdl') }}
          </UButton>
        </div>
      </div>

      <!-- Step 3: Analyze + Review EDL -->
      <div v-else-if="currentStep === 3" class="space-y-4">
        <!-- Analyzing state -->
        <div
          v-if="analyzing"
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-8 text-center bg-neutral-50 dark:bg-neutral-900/50"
        >
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

        <!-- Review state: split workspace (design #4) -->
        <div v-else-if="edlResult" class="space-y-4">
          <div class="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <!-- LEFT: EDL segment list + scoring -->
            <div class="xl:col-span-7 flex flex-col gap-3">
              <!-- Section header -->
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary">
                    <UIcon name="i-lucide-list-ordered" class="w-4 h-4" />
                  </div>
                  <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {{ t('tmcut.wizard.reviewList', { count: segmentCount }) }}
                  </h3>
                </div>
                <span
                  class="font-mono text-[11px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
                >
                  EDL · {{ edlResult.edl.profile }} · {{ edlResult.edl.analyzerVersion }}
                </span>
              </div>

              <!-- Metric stat strip + bulk actions -->
              <div
                class="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3"
              >
                <div class="flex items-center gap-4">
                  <div class="flex flex-col">
                    <span class="text-[10px] uppercase tracking-wider text-neutral-400">
                      {{ t('tmcut.wizard.keptLabel') }}
                    </span>
                    <div class="flex items-baseline gap-1">
                      <span class="font-mono text-lg font-bold text-primary">
                        {{ formatDurationSec(keptDuration) }}
                      </span>
                      <span class="font-mono text-[11px] text-neutral-400">
                        / {{ t('tmcut.wizard.sourceLabel', { duration: formatDurationSec(sourceDuration) }) }}
                      </span>
                    </div>
                  </div>
                  <div class="h-6 w-px bg-neutral-200 dark:bg-neutral-700" />
                  <div class="flex flex-col">
                    <span class="text-[10px] uppercase tracking-wider text-neutral-400">
                      {{ t('tmcut.wizard.compressionLabel') }}
                    </span>
                    <span class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {{ t('tmcut.wizard.compressionValue', { pct: compressionPct }) }}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-1.5">
                  <UButton
                    size="xs"
                    variant="soft"
                    color="neutral"
                    :label="t('tmcut.wizard.bulkAll', { count: segmentCount })"
                    @click="bulkSelectAll"
                  />
                  <UButton
                    size="xs"
                    variant="soft"
                    color="neutral"
                    :label="t('tmcut.wizard.bulkHigh')"
                    @click="bulkSelectHigh"
                  />
                  <UButton
                    v-if="fillerCount > 0"
                    size="xs"
                    variant="soft"
                    color="warning"
                    icon="i-lucide-filter-x"
                    :label="t('tmcut.autocutV2.deselectFillers', { count: fillerCount })"
                    @click="bulkDeselectFillers"
                  />
                  <UButton
                    v-if="highlightCount > 0"
                    size="xs"
                    variant="soft"
                    color="primary"
                    icon="i-lucide-sparkles"
                    :label="t('tmcut.autocutV2.selectHighlights', { count: highlightCount })"
                    @click="bulkSelectHighlights"
                  />
                </div>
              </div>

              <!-- Profile scorer selector: clicking re-runs the real scoring pipeline -->
              <div class="flex flex-col gap-1.5">
                <span class="text-[10px] uppercase tracking-wider text-neutral-400">
                  {{ t('tmcut.wizard.scorerLabel') }}
                </span>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-1.5">
                  <button
                    v-for="prof in aiProfiles"
                    :key="prof.id"
                    type="button"
                    class="flex items-center justify-between p-2.5 rounded-lg border text-left transition cursor-pointer"
                    :class="selectedProfile === prof.id
                      ? 'border-primary/60 bg-primary/5 shadow-sm'
                      : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900'"
                    :disabled="analyzing"
                    @click="rescoreWith(prof.id as AutocutProfile)"
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <UIcon
                        :name="prof.icon"
                        class="w-4 h-4 shrink-0"
                        :class="selectedProfile === prof.id ? 'text-primary' : 'text-neutral-400'"
                      />
                      <span
                        class="text-xs font-medium truncate"
                        :class="selectedProfile === prof.id ? 'text-primary' : 'text-neutral-600 dark:text-neutral-300'"
                      >
                        {{ prof.name }}
                      </span>
                    </div>
                    <span v-if="selectedProfile === prof.id" class="w-2 h-2 rounded-full bg-primary shrink-0" />
                  </button>
                </div>
              </div>

              <!-- Segment list cards -->
              <div
                v-if="segmentCount === 0"
                class="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-8 text-center"
              >
                <p class="text-sm text-neutral-500">
                  {{ t('tmcut.steps.noSegments') }}
                </p>
              </div>

              <div v-else ref="listRef" class="flex flex-col gap-1.5 max-h-120 overflow-y-auto pr-1">
                <div
                  v-for="(segment, index) in segments"
                  :key="index"
                  class="flex flex-col md:flex-row items-start md:items-center gap-3 p-2.5 rounded-xl border transition cursor-pointer"
                  :class="activeSegmentIndex === index
                    ? 'border-primary/50 bg-primary/5 shadow-sm'
                    : included.includes(index)
                      ? 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300'
                      : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 opacity-60'"
                  @click="selectSegment(index)"
                >
                  <!-- Checkbox & sequence # -->
                  <div class="flex items-center gap-2 shrink-0">
                    <UCheckbox
                      :model-value="included.includes(index)"
                      @click.stop
                      @update:model-value="toggleInclude(index)"
                    />
                    <span
                      class="font-mono text-[11px] font-semibold"
                      :class="activeSegmentIndex === index ? 'text-primary' : 'text-neutral-400'"
                    >
                      #{{ String(index + 1).padStart(2, '0') }}
                    </span>
                  </div>

                  <!-- Thumbnail with In/Out chip: a per-segment frame at
                       its representative time (roadmap G-1 extractFrame),
                       falling back to the shared source poster while the
                       batch extracts / on web sessions. -->
                  <div
                    class="relative w-28 h-16 rounded-lg overflow-hidden shrink-0 bg-neutral-200 dark:bg-neutral-800"
                    :class="{ grayscale: !included.includes(index) }"
                  >
                    <img
                      v-if="segmentThumbs[index] || sourceThumbUrl"
                      :src="segmentThumbs[index] || sourceThumbUrl"
                      class="w-full h-full object-cover"
                      alt=""
                    >
                    <UIcon v-else name="i-lucide-film" class="w-6 h-6 text-neutral-400 absolute inset-0 m-auto" />
                    <span class="absolute bottom-1 right-1 px-1 rounded bg-black/70 text-white font-mono text-[9px]">
                      {{ formatRange(segment.start, segment.end) }}
                    </span>
                  </div>

                  <!-- Segment meta & transcript -->
                  <div class="flex flex-col flex-1 min-w-0 gap-1">
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <span class="font-mono text-xs text-neutral-900 dark:text-neutral-100 font-semibold">
                          {{ formatRange(segment.start, segment.end) }}
                        </span>
                        <span class="font-mono text-[10px] text-neutral-400">
                          ({{ Math.max(0, segment.end - segment.start).toFixed(1) }}s)
                        </span>
                      </div>
                      <span
                        class="px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                        :class="scoreBadgeClass(segment.score)"
                      >
                        {{ Math.round(segment.score * 100) }}/100
                      </span>
                    </div>
                    <p v-if="transcriptLines[index]" class="text-xs italic text-primary/80 truncate">
                      “{{ transcriptLines[index] }}”
                    </p>
                    <div class="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                      <div
                        class="h-full rounded-full transition-all"
                        :class="scoreBarClass(segment.score)"
                        :style="{ width: `${Math.round(segment.score * 100)}%` }"
                      />
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span
                        class="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 truncate"
                      >
                        {{ segment.reason }}
                      </span>
                      <span
                        v-if="segment.hasFillerWords || segment.reason === 'filler-word'"
                        class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium"
                      >
                        <UIcon name="i-lucide-message-square-warning" class="w-3 h-3" />
                        {{ t('tmcut.autocutV2.fillerTag') }}<template v-if="segment.detectedFillers?.length">: {{
                          segment.detectedFillers.join(', ') }}</template>
                      </span>
                      <span
                        v-if="segment.isHighlight || segment.reason === 'highlight'"
                        class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium"
                      >
                        <UIcon name="i-lucide-sparkles" class="w-3 h-3" />
                        {{ t('tmcut.autocutV2.highlightTag') }}<template v-if="segment.matchedKeywords?.length">: {{
                          segment.matchedKeywords.join(', ') }}</template>
                      </span>
                    </div>
                  </div>

                  <!-- Segment action: preview this segment (the mockup's "tune
                       In/Out" button has no implementation — not rendered) -->
                  <div class="flex items-center gap-1 shrink-0 self-end md:self-center">
                    <button
                      type="button"
                      class="w-7 h-7 flex items-center justify-center rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-primary hover:text-neutral-900 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
                      :title="t('tmcut.wizard.playSegment')"
                      @click.stop="selectSegment(index, true)"
                    >
                      <UIcon name="i-lucide-play" class="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- RIGHT: mini player + breakdown + draft notice -->
            <div class="xl:col-span-5 flex flex-col gap-4">
              <!-- Video player mini-review card -->
              <div
                class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-900 flex flex-col gap-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <UIcon name="i-lucide-crop-portrait" class="w-4 h-4 text-primary shrink-0" />
                    <span class="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                      {{ t('tmcut.wizard.playerTitle', {
                        index: activeSegmentIndex === null ? '–' : activeSegmentIndex
                          + 1
                      }) }}
                    </span>
                  </div>
                  <span
                    class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 shrink-0"
                  >
                    {{ t('tmcut.wizard.guideTag') }}
                  </span>
                </div>

                <div
                  class="relative w-full aspect-video rounded-xl overflow-hidden bg-black flex items-center justify-center"
                >
                  <video
                    ref="reviewVideo"
                    :src="sourceVideoUrl"
                    class="w-full h-full object-contain"
                    preload="metadata"
                    playsinline
                    @loadedmetadata="onReviewLoadedMetadata"
                    @timeupdate="onReviewTimeUpdate"
                    @play="reviewPlaying = true"
                    @pause="reviewPlaying = false"
                  />

                  <!-- 9:16 crop guide mask (visual guide only — no face tracking) -->
                  <div
                    class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[42%] pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] rounded"
                  >
                    <div class="absolute top-1 inset-x-1 flex justify-between text-[9px] font-mono text-primary/80">
                      <span>9:16 CROP</span>
                      <span>{{ t('tmcut.wizard.guideTag') }}</span>
                    </div>
                    <div class="absolute bottom-1 inset-x-1 text-center">
                      <span class="px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-neutral-300">
                        {{ t('tmcut.wizard.guideBottom') }}
                      </span>
                    </div>
                  </div>

                  <!-- Playback state overlay -->
                  <div class="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/80 px-2 py-0.5 rounded-md">
                    <span
                      class="w-1.5 h-1.5 rounded-full"
                      :class="reviewPlaying ? 'bg-primary animate-pulse' : 'bg-neutral-500'"
                    />
                    <span class="font-mono text-[11px] text-primary">
                      {{ formatDurationSec(Math.max(0, reviewTime - (activeSegment?.start || 0))) }} /
                      {{ activeSegment ? formatDurationSec(activeSegment.end - activeSegment.start) : '--:--' }}
                    </span>
                  </div>
                </div>

                <!-- Mini scrubber + transport -->
                <div class="flex flex-col gap-1.5">
                  <div
                    class="relative w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden cursor-pointer"
                    @click="seekReview"
                  >
                    <div
                      class="absolute left-0 top-0 bottom-0 bg-primary transition-all"
                      :style="{ width: `${reviewProgress}%` }"
                    />
                  </div>
                  <div class="flex items-center justify-between font-mono text-[10px] text-neutral-400">
                    <span>In: {{ activeSegment ? formatDurationSec(activeSegment.start) : '--:--' }}</span>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        class="text-neutral-500 hover:text-primary transition-colors cursor-pointer"
                        :title="t('tmcut.wizard.replay5')"
                        @click="nudgeReview(-5)"
                      >
                        <UIcon name="i-lucide-rotate-ccw" class="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        class="w-6 h-6 rounded-full bg-primary text-neutral-900 flex items-center justify-center cursor-pointer"
                        :title="reviewPlaying ? t('tmcut.wizard.pause') : t('tmcut.wizard.play')"
                        @click="toggleReviewPlay"
                      >
                        <UIcon :name="reviewPlaying ? 'i-lucide-pause' : 'i-lucide-play'" class="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        class="text-neutral-500 hover:text-primary transition-colors cursor-pointer"
                        :title="t('tmcut.wizard.forward5')"
                        @click="nudgeReview(5)"
                      >
                        <UIcon name="i-lucide-fast-forward" class="w-4 h-4" />
                      </button>
                    </div>
                    <span>Out: {{ activeSegment ? formatDurationSec(activeSegment.end) : '--:--' }}</span>
                  </div>
                </div>
              </div>

              <!-- AI analysis breakdown (real metrics only — no loudness /
                   face-tracker numbers exist in the pipeline) -->
              <div
                class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-900 flex flex-col gap-2"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-bar-chart-3" class="w-4 h-4 text-primary" />
                    <span class="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {{ t('tmcut.wizard.breakdownTitle') }}
                    </span>
                  </div>
                  <span class="font-mono text-[10px] text-neutral-400">§65.6</span>
                </div>
                <div class="grid grid-cols-2 gap-1.5">
                  <div class="bg-neutral-50 dark:bg-neutral-900/60 p-2.5 rounded-lg flex flex-col">
                    <div class="flex items-center justify-between mb-0.5">
                      <span class="text-[10px] text-neutral-400">{{ t('tmcut.wizard.metricScenes') }}</span>
                      <UIcon name="i-lucide-scissors" class="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span class="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {{ edlResult.sceneCount }}
                    </span>
                    <span class="text-[10px] text-neutral-500 truncate">
                      {{ t('tmcut.wizard.metricScenesSub') }}
                    </span>
                  </div>
                  <div class="bg-neutral-50 dark:bg-neutral-900/60 p-2.5 rounded-lg flex flex-col">
                    <div class="flex items-center justify-between mb-0.5">
                      <span class="text-[10px] text-neutral-400">{{ t('tmcut.wizard.metricSilences') }}</span>
                      <UIcon name="i-lucide-volume-x" class="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span class="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {{ edlResult.silenceCount }}
                    </span>
                    <span class="text-[10px] text-neutral-500 truncate">
                      {{ t('tmcut.wizard.metricSilencesSub', {
                        duration: formatDurationSec(edlResult.silenceRemovedSec)
                      })
                      }}
                    </span>
                  </div>
                  <div class="bg-neutral-50 dark:bg-neutral-900/60 p-2.5 rounded-lg flex flex-col">
                    <div class="flex items-center justify-between mb-0.5">
                      <span class="text-[10px] text-neutral-400">{{ t('tmcut.wizard.metricSpeech') }}</span>
                      <UIcon name="i-lucide-mic" class="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span class="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {{ edlResult.transcriptUsed ? `${speechPct}%` : '—' }}
                    </span>
                    <span class="text-[10px] text-neutral-500 truncate">
                      {{ edlResult.transcriptUsed ? t('tmcut.steps.transcriptOn') : t('tmcut.steps.transcriptOff') }}
                    </span>
                  </div>
                  <div class="bg-neutral-50 dark:bg-neutral-900/60 p-2.5 rounded-lg flex flex-col">
                    <div class="flex items-center justify-between mb-0.5">
                      <span class="text-[10px] text-neutral-400">{{ t('tmcut.wizard.metricSource') }}</span>
                      <UIcon name="i-lucide-clock" class="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span class="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {{ formatDurationSec(sourceDuration) }}
                    </span>
                    <span class="text-[10px] text-neutral-500 truncate">
                      {{ sourceAsset?.name || '—' }}
                    </span>
                  </div>
                </div>

                <!-- Safe draft project notice (docs §41) -->
                <div class="p-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-start gap-2">
                  <div
                    class="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5"
                  >
                    <UIcon name="i-lucide-shield-check" class="w-3 h-3" />
                  </div>
                  <div class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-1.5">
                      <span class="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                        {{ t('tmcut.wizard.draftNoticeTitle') }}
                      </span>
                      <span class="font-mono text-[9px] bg-white dark:bg-neutral-900 px-1 rounded text-neutral-500">
                        Non-destructive
                      </span>
                    </div>
                    <p class="text-[11px] text-neutral-500 leading-relaxed">
                      {{ t('tmcut.wizard.draftNotice') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom action bar -->
          <div
            class="sticky bottom-0 z-40 px-3 py-2.5 bg-white/95 dark:bg-neutral-950/95 backdrop-blur border-t border-neutral-200 dark:border-neutral-800 rounded-b-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg"
          >
            <div class="flex items-center gap-2 text-sm">
              <span class="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span class="font-medium text-neutral-900 dark:text-neutral-100">
                {{ t('tmcut.wizard.selectedSummary', { selected: included.length, total: segmentCount }) }}
              </span>
              <span class="text-neutral-300 dark:text-neutral-700">•</span>
              <span class="text-neutral-500">{{ t('tmcut.wizard.publishDuration') }}</span>
              <span class="font-mono font-bold text-primary">{{ formatDurationSec(keptDuration) }}</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <UButton
                variant="soft"
                color="neutral"
                size="sm"
                @click="currentStep = 2"
              >
                {{ t('tmcut.back') }}
              </UButton>
              <UButton
                variant="soft"
                color="neutral"
                size="sm"
                icon="i-lucide-refresh-cw"
                :loading="analyzing"
                @click="startAnalysis"
              >
                {{ t('tmcut.wizard.rerun') }}
              </UButton>
              <UButton
                color="primary"
                variant="solid"
                size="sm"
                icon="i-lucide-clapperboard"
                :disabled="included.length === 0 || applying"
                :loading="applying"
                @click="handleAccept"
              >
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
          <UButton
            color="primary"
            variant="solid"
            icon="i-lucide-clapperboard"
            :to="editorUrl"
          >
            {{ t('tmcut.steps.openInEditor') }}
          </UButton>
        </div>
      </div>
    </div>
  </BasePage>
</template>
