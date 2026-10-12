import type { TmcutAsset } from '~/types/tmcut'
import type { TmcutEdl, TmcutEdlSegment } from '@tmcut-core'
import {
  parseSceneOutput,
  parseSilenceOutput,
  scoreSegments,
  segmentsToClips,
  ticksToSec,
  validateEdl
} from '@tmcut-core'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useTmcutMedia } from '~/composables/useTmcutMedia'
import { useTmcutAi } from '~/composables/useTmcutAi'

export type AutocutProfile = 'viral-shorts' | 'podcast-summary' | 'cinematic-vlog'

export interface AutocutOptions {
  filterFillerWords?: boolean
  highlightKeywords?: string[]
  customFillerWords?: string[]
}

export interface AutocutAnalysis {
  edl: TmcutEdl
  sceneCount: number
  transcriptUsed: boolean
  /** total source duration, seconds (from FFmpeg scene probe) */
  sourceDurationSec: number
  /** number of silence ranges detected by FFmpeg silencedetect */
  silenceCount: number
  /** total seconds covered by the detected silences */
  silenceRemovedSec: number
  /** total seconds covered by the transcript (speech coverage) */
  speechSec: number
  /** raw transcript lines kept so the review UI can show real text */
  transcript: Array<{ start: number, end: number, text?: string }>
  /** count of segments detected containing filler words */
  fillerSegmentCount: number
  /** count of segments boosted with highlight keywords */
  highlightSegmentCount: number
}

function tmcutIpc() {
  return typeof window !== 'undefined' ? window.electronAPI?.tmcut : undefined
}

/**
 * AutoCut pipeline driver (roadmap section 65.6): scene/silence detection
 * in main, optional Whisper transcript via the AI gateway, pure scoring
 * in @tmcut/core, draft project application without touching sources.
 */
export function useTmcutAutocut() {
  const { createProject, addClipToTrack, switchCanvas } = useTmcutProject()
  const { linkAssetToProject } = useTmcutMedia()
  const { transcribe, status } = useTmcutAi()

  const analyzing = ref(false)
  const stageKey = ref('')
  const analysisError = ref<string | null>(null)

  async function analyzeSource(
    asset: TmcutAsset,
    profile: AutocutProfile,
    options?: AutocutOptions
  ): Promise<AutocutAnalysis | null> {
    const ipc = tmcutIpc()
    if (!ipc?.analyzeScenes || !ipc?.analyzeSilence) {
      analysisError.value = 'desktop-only'
      return null
    }
    analyzing.value = true
    analysisError.value = null
    try {
      stageKey.value = 'tmcut.steps.stageScenes'
      const scenes = await ipc.analyzeScenes({ filePath: asset.path })
      if (!scenes?.ok) throw new Error(scenes?.error || 'scene-detection-failed')

      stageKey.value = 'tmcut.steps.stageSilence'
      const silence = await ipc.analyzeSilence({ filePath: asset.path })
      if (!silence?.ok) throw new Error(silence?.error || 'silence-detection-failed')

      const durationSec = scenes.durationSec || silence.durationSec || asset.meta.durationSec || 0
      const shotList = parseSceneOutput(scenes.log, durationSec)
      const silenceList = parseSilenceOutput(silence.log, durationSec)

      // Transcript is best-effort: EDL scoring degrades gracefully without it.
      let speech: Array<{ start: number, end: number }> = []
      let transcriptText: Array<{ start: number, end: number, text?: string }> = []
      let transcriptUsed = false
      stageKey.value = 'tmcut.steps.stageTranscript'
      try {
        const aiStatus = await status()
        if (aiStatus?.hasKey) {
          const transcript = await transcribe(asset.path, { format: 'verbose_json' })
          const rawSegments = transcript.segments ?? []
          speech = rawSegments.map(segment => ({ start: segment.start, end: segment.end }))
          // Keep the text so the review UI can show a real transcript line
          // per EDL segment (scoring only needs the timings).
          transcriptText = rawSegments.map(segment => ({ start: segment.start, end: segment.end, text: segment.text }))
          transcriptUsed = speech.length > 0
        }
      } catch {
        speech = []
        transcriptText = []
      }

      stageKey.value = 'tmcut.steps.stageScoring'
      const edl = scoreSegments({
        scenes: shotList,
        silences: silenceList,
        speech,
        transcript: transcriptText,
        profile,
        assetId: asset.id,
        analyzerVersion: 'transcript-v2',
        filterFillerWords: options?.filterFillerWords,
        keywords: options?.highlightKeywords,
        customFillerWords: options?.customFillerWords
      })
      const problems = validateEdl(edl)
      if (problems.length > 0) throw new Error(problems[0])
      const silenceRemovedSec = silenceList.reduce(
        (total, range) => total + Math.max(0, range.end - range.start),
        0
      )
      const speechSec = speech.reduce(
        (total, range) => total + Math.max(0, range.end - range.start),
        0
      )
      const fillerSegmentCount = edl.segments.filter(
        segment => segment.hasFillerWords || segment.reason === 'filler-word'
      ).length
      const highlightSegmentCount = edl.segments.filter(
        segment => segment.isHighlight || segment.reason === 'highlight'
      ).length
      return {
        edl,
        sceneCount: shotList.length,
        transcriptUsed,
        sourceDurationSec: durationSec,
        silenceCount: silenceList.length,
        silenceRemovedSec,
        speechSec,
        transcript: transcriptText,
        fillerSegmentCount,
        highlightSegmentCount
      }
    } catch (err: unknown) {
      analysisError.value = err instanceof Error ? err.message : String(err)
      return null
    } finally {
      analyzing.value = false
      stageKey.value = ''
    }
  }

  /**
   * Apply accepted EDL segments as a NEW draft project (source untouched,
   * docs section 41). Returns the draft project id, or null when nothing
   * applies (empty selection or an invalid EDL).
   */
  async function applyDraft(
    asset: TmcutAsset,
    edl: TmcutEdl,
    included: number[],
    projectName: string
  ): Promise<string | null> {
    const segments: TmcutEdlSegment[] = []
    for (const index of included) {
      const segment = edl.segments[index]
      if (segment) segments.push(segment)
    }
    // Core (C10) validates the EDL, drops broken spans, sorts by start and
    // lays the kept segments out contiguously — v3 ticks in, v3 ticks out.
    const clips = segmentsToClips(edl, segments)
    if (clips.length === 0) return null
    const proj = createProject(projectName)
    if (edl.profile === 'viral-shorts') {
      switchCanvas(1080, 1920)
    } else if (asset.meta.width > 0 && asset.meta.height > 0) {
      switchCanvas(asset.meta.width, asset.meta.height)
    }
    linkAssetToProject(asset.id, proj.id)
    // The editor timeline is the legacy v1 seconds model: convert the core
    // ticks back at the boundary, like every other core bridge.
    for (const clip of clips) {
      addClipToTrack('video', {
        name: asset.name,
        src: asset.path,
        in: ticksToSec(clip.in),
        out: ticksToSec(clip.out),
        offset: ticksToSec(clip.offset)
      })
    }
    return proj.id
  }

  return {
    analyzing,
    stageKey,
    analysisError,
    analyzeSource,
    applyDraft
  }
}
