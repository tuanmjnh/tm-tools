import { ref } from 'vue'
import { useTmcutAi } from './useTmcutAi'
import { useTmcutProject } from './useTmcutProject'
import type { TmcutProject } from './useTmcutProject'
import {
  durationToSeconds,
  CURATED_SCRIPT_PRESETS,
  exportScriptMarkdown,
  type TmcutAiScript,
  type TmcutAiScriptScene,
  type GenerateScriptOptions
} from '../utils/tmcut/aiScript'

export * from '../utils/tmcut/aiScript'

/**
 * Composable providing AI Scriptwriting & Storyboard generation capabilities.
 */
export function useTmcutAiScript() {
  const { complete, status } = useTmcutAi()
  const { createProject, addClipToTrack, switchCanvas, currentProject } = useTmcutProject()

  const generating = ref(false)
  const error = ref<string | null>(null)
  const generatedScript = ref<TmcutAiScript | null>(null)
  const hasAiKey = ref(false)

  async function checkGatewayStatus() {
    try {
      const st = await status()
      hasAiKey.value = !!st?.hasKey
      return hasAiKey.value
    } catch {
      hasAiKey.value = false
      return false
    }
  }

  /**
   * Generates a video storyboard script based on user prompt and parameters.
   */
  async function generateScript(options: GenerateScriptOptions): Promise<TmcutAiScript> {
    generating.value = true
    error.value = null

    const targetSec = durationToSeconds(options.duration)
    const lang = options.language || 'vi'

    try {
      const keyAvailable = await checkGatewayStatus()

      if (!keyAvailable) {
        // Fallback to curated preset matched by platform
        const matched = CURATED_SCRIPT_PRESETS.find(p => p.platform === options.platform) || CURATED_SCRIPT_PRESETS[0]!
        const customized: TmcutAiScript = {
          ...matched,
          title: options.prompt ? `Kịch bản: ${options.prompt.slice(0, 50)}` : matched.title,
          platform: options.platform,
          targetDurationSec: targetSec,
          createdAt: new Date().toISOString()
        }
        generatedScript.value = customized
        return customized
      }

      const systemPrompt = `You are an expert video director and viral scriptwriter for short-form (TikTok, Reels, Shorts) and long-form (YouTube, Vlogs).
Create an engaging, structured video storyboard script in ${lang === 'vi' ? 'Vietnamese' : 'English'}.
The target total duration is approximately ${targetSec} seconds.
Output strictly a JSON object with this exact structure:
{
  "title": "Compelling video title",
  "synopsis": "One sentence summary of the video",
  "platform": "${options.platform}",
  "targetDurationSec": ${targetSec},
  "scenes": [
    {
      "id": "scene-1",
      "order": 1,
      "title": "Hook / Intro",
      "durationSec": 4,
      "visualPrompt": "Detailed visual description for video/camera or B-roll",
      "voiceover": "Spoken voiceover or dialogue text",
      "onScreenText": "Short catchy text/caption displayed on screen"
    }
  ]
}
Make sure the sum of all scenes' durationSec equals approximately ${targetSec} seconds.
Keep onScreenText punchy, short, and suited for video overlays.`

      const userMessage = `Create a video script for the following topic/idea:
"${options.prompt}"
Target platform: ${options.platform}
Target duration: ${options.duration}`

      const aiResponse = await complete({
        task: 'plan',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        jsonMode: true,
        temperature: 0.7
      })

      const parsed = JSON.parse(aiResponse.content) as Partial<TmcutAiScript>

      if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
        throw new Error('AI returned invalid script structure')
      }

      const script: TmcutAiScript = {
        title: parsed.title || options.prompt || 'Kịch bản Video AI',
        synopsis: parsed.synopsis || '',
        platform: options.platform,
        targetDurationSec: targetSec,
        scenes: parsed.scenes.map((s: Partial<TmcutAiScriptScene>, idx: number) => ({
          id: s.id || `scene-${idx + 1}`,
          order: s.order || idx + 1,
          title: s.title || `Cảnh ${idx + 1}`,
          durationSec: Number(s.durationSec) || 5,
          visualPrompt: s.visualPrompt || '',
          voiceover: s.voiceover || '',
          onScreenText: s.onScreenText || s.title || ''
        })),
        createdAt: new Date().toISOString()
      }

      generatedScript.value = script
      return script
    } catch (err: unknown) {
      // If AI call failed, provide a curated preset gracefully
      const matched = CURATED_SCRIPT_PRESETS.find(p => p.platform === options.platform) || CURATED_SCRIPT_PRESETS[0]!
      const fallbackScript: TmcutAiScript = {
        ...matched,
        title: options.prompt ? `Kịch bản: ${options.prompt.slice(0, 50)}` : matched.title,
        platform: options.platform,
        targetDurationSec: targetSec,
        createdAt: new Date().toISOString()
      }
      generatedScript.value = fallbackScript
      error.value = err instanceof Error ? err.message : String(err)
      return fallbackScript
    } finally {
      generating.value = false
    }
  }

  /**
   * Creates a brand new project populated with text overlay clips from the script.
   */
  function createProjectFromScript(script: TmcutAiScript): TmcutProject {
    const proj = createProject(script.title || 'Dự án Kịch bản AI')

    // Set canvas aspect ratio based on platform
    if (script.platform === 'tiktok-shorts') {
      switchCanvas(1080, 1920) // 9:16 vertical
    } else {
      switchCanvas(1920, 1080) // 16:9 horizontal
    }

    let runningOffset = 0
    for (const scene of script.scenes) {
      const dur = Math.max(1, scene.durationSec)
      addClipToTrack('text', {
        name: scene.title,
        text: scene.onScreenText || scene.title,
        offset: runningOffset,
        in: 0,
        out: dur,
        fontSize: script.platform === 'tiktok-shorts' ? 52 : 44,
        color: '#FFFFFF'
      })
      runningOffset += dur
    }

    return proj
  }

  /**
   * Inserts text overlay clips from the script into the currently active project timeline.
   */
  function insertScriptToCurrentTimeline(script: TmcutAiScript, startOffsetSec = 0): number {
    if (!currentProject.value) return 0

    let runningOffset = startOffsetSec
    let addedCount = 0

    for (const scene of script.scenes) {
      const dur = Math.max(1, scene.durationSec)
      addClipToTrack('text', {
        name: scene.title,
        text: scene.onScreenText || scene.title,
        offset: runningOffset,
        in: 0,
        out: dur,
        fontSize: 48,
        color: '#FFFFFF'
      })
      runningOffset += dur
      addedCount++
    }

    return addedCount
  }

  return {
    generating,
    error,
    generatedScript,
    hasAiKey,
    checkGatewayStatus,
    generateScript,
    createProjectFromScript,
    insertScriptToCurrentTimeline,
    exportScriptMarkdown
  }
}
