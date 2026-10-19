import type { AiCompleteInput, AiGatewayStatus, AiModelInfo, AiProviderPreset, AiTaskStatus } from '~~/types/electron'

function aiApi() {
  return typeof window !== 'undefined' ? window.electronAPI?.tools?.aiGateway : undefined
}

/**
 * Renderer-side AI client (roadmap section 66). Thin IPC wrapper only:
 * keys, rate limits, retries and audit logs live in the main-process
 * gateway (electron/tools/ai-gateway.cjs) — never in the renderer.
 */
export function useTmcutAi() {
  const isDesktop = computed(() => !!aiApi())

  async function complete(input: AiCompleteInput) {
    const api = aiApi()
    if (!api) throw new Error('AI gateway requires the desktop (Electron) app')
    const res = await api.complete(input)
    if (!res?.ok || !res.data) {
      throw new Error(res?.error || `AI request failed (${res?.code || 'unknown'})`)
    }
    return res.data
  }

  async function transcribe(filePath: string, opts: { provider?: string, model?: string, language?: string, format?: 'text' | 'verbose_json' } = {}) {
    const api = aiApi()
    if (!api) throw new Error('AI gateway requires the desktop (Electron) app')
    const res = await api.transcribe({ filePath, ...opts })
    if (!res?.ok || !res.data) {
      throw new Error(res?.error || `Transcription failed (${res?.code || 'unknown'})`)
    }
    return res.data
  }

  async function status(): Promise<AiGatewayStatus | null> {
    const api = aiApi()
    if (!api) return null
    try {
      return await api.getStatus()
    } catch {
      return null
    }
  }

  /**
   * Model discovery for multi-provider gateways (FreeLLMAPI et al.):
   * GET {base}/models through the main process, so the key never reaches
   * the renderer and the result can populate a model picker.
   * With `task` (R139) the call resolves the SAVED per-surface slots in
   * the main process — a "test this connection" action verifies the
   * surface's stored key without the renderer ever holding it.
   */
  async function listModels(args: { provider?: string, apiKey?: string, baseUrl?: string, task?: string } = {}): Promise<AiModelInfo[]> {
    const api = aiApi()
    if (!api) throw new Error('AI gateway requires the desktop (Electron) app')
    const res = await api.models(args)
    if (!res?.ok || !res.data) {
      throw new Error(res?.error || `Model list failed (${res?.code || 'unknown'})`)
    }
    return res.data.models
  }

  /** Provider presets (built-in endpoints + aggregator entries). */
  async function providerPresets(): Promise<AiProviderPreset[]> {
    const api = aiApi()
    if (!api) return []
    try {
      const res = await api.presets()
      return res?.ok && res.data ? res.data.presets : []
    } catch {
      return []
    }
  }

  /**
   * Per-surface routing (editor vs AutoCut): which provider/model each AI
   * task ACTUALLY runs on. A task can differ from the global config when
   * the AI_*_<TASK> slots are set, so surfaces badge their own model.
   */
  async function tasks(): Promise<Record<string, AiTaskStatus> | null> {
    const api = aiApi()
    if (!api) return null
    try {
      const res = await api.tasks()
      return res?.ok && res.data ? res.data.tasks : null
    } catch {
      return null
    }
  }

  return {
    isDesktop,
    complete,
    transcribe,
    status,
    listModels,
    providerPresets,
    tasks
  }
}
