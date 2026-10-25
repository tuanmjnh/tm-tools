import type { AiCompleteInput, AiGatewayStatus, AiModelInfo, AiProviderPreset, AiTaskStatus } from '#shared/types/electron'
import { useHub } from './useHub'

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

  // Resolved lazily on purpose: the gateway itself is Electron IPC and needs
  // no hub session, so building the hub client here would make every consumer
  // of this composable (Node unit harnesses included) require the Nuxt runtime.
  // Only the hub provider catalogue touches it.
  let hub: ReturnType<typeof useHub> | null = null
  function hubClient() {
    if (!hub) hub = useHub()
    return hub
  }

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

  /**
   * Provider presets — gateway builtins (IPC) MERGED with the hub's global
   * provider catalog (`GET /api/v1/apps/:appId/ai/providers`, user JWT +
   * `ai.providers.read`; fail-soft 403/offline → gateway builtins only).
   * A hub preset with the same id OVERRIDES the gateway builtin (central
   * baseUrl correction); hub-only definitions are appended as new presets.
   */
  async function providerPresets(): Promise<AiProviderPreset[]> {
    const gateway = await (async () => {
      const api = aiApi()
      if (!api) return []
      try {
        const res = await api.presets()
        return res?.ok && res.data ? res.data.presets : []
      } catch {
        return []
      }
    })()

    try {
      const { hubFetch, appId } = hubClient()
      const res = await hubFetch<{ success: boolean, data: Array<{ definition: { key: string, name: string, category: string, base_url_default: string | null } }> }>(
        `/api/v1/apps/${appId}/ai/providers`
      )
      const defs = (res?.data ?? []).filter(d => d.definition?.category === 'ai_llm')
      const byId = new Map(gateway.map(p => [p.id, { ...p }]))
      for (const { definition } of defs) {
        const preset: AiProviderPreset = {
          id: definition.key,
          label: definition.name,
          baseUrl: definition.base_url_default || '',
          keyless: false,
          requiresModel: false,
          needsBaseUrl: !definition.base_url_default
        }
        byId.set(definition.key, preset) // hub wins on the same id
      }
      return [...byId.values()]
    } catch {
      return gateway
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
