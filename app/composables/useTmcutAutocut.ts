import type { TmcutAsset } from '~/types/tmcut'
import type { TmcutEdl } from '@tmcut-core'
import {
  parseSceneOutput,
  parseSilenceOutput,
  scoreSegments,
  validateEdl
} from '@tmcut-core'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useTmcutMedia } from '~/composables/useTmcutMedia'
import { useTmcutAi } from '~/composables/useTmcutAi'

export type AutocutProfile = 'viral-shorts' | 'podcast-summary' | 'cinematic-vlog'

export interface AutocutAnalysis {
  edl: TmcutEdl
  sceneCount: number
  transcriptUsed: boolean
}

export interface AutocutAnalysis {
  edl: TmcutEdl
  sceneCount: number
  transcriptUsed: boolean
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

  async function analyzeSource(asset: TmcutAsset, profile: AutocutProfile): Promise<AutocutAnalysis | null> {
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
      let transcriptUsed = false
      stageKey.value = 'tmcut.steps.stageTranscript'
      try {
        const aiStatus = await status()
        if (aiStatus?.hasKey) {
          const transcript = await transcribe(asset.path, { format: 'verbose_json' })
          speech = (transcript.segments ?? []).map(segment => ({ start: segment.start, end: segment.end }))
          transcriptUsed = speech.length > 0
        }
      } catch {
        speech = []
      }

      stageKey.value = 'tmcut.steps.stageScoring'
      const edl = scoreSegments({
        scenes: shotList,
        silences: silenceList,
        speech,
        profile,
        assetId: asset.id,
        analyzerVersion: 'scene-1'
      })
      const problems = validateEdl(edl)
      if (problems.length > 0) throw new Error(problems[0])
      return { edl, sceneCount: shotList.length, transcriptUsed }
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
   * docs section 41). Returns the draft project id.
   */
  async function applyDraft(
    asset: TmcutAsset,
    edl: TmcutEdl,
    included: number[],
    projectName: string
  ): Promise<string | null> {
    const segments = []
    for (const index of included) {
      const segment = edl.segments[index]
      if (segment && segment.end > segment.start) segments.push(segment)
    }
    segments.sort((a, b) => (a?.start ?? 0) - (b?.start ?? 0))
    if (segments.length === 0) return null
    const proj = createProject(projectName)
    if (edl.profile === 'viral-shorts') {
      switchCanvas(1080, 1920)
    } else if (asset.meta.width > 0 && asset.meta.height > 0) {
      switchCanvas(asset.meta.width, asset.meta.height)
    }
    linkAssetToProject(asset.id, proj.id)
    for (const segment of segments) {
      addClipToTrack('video', {
        name: asset.name,
        src: asset.path,
        in: segment.start,
        out: segment.end,
        speed: 1
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
