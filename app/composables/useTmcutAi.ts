import type { AiCompleteInput } from '~~/types/electron'

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

  async function status() {
    const api = aiApi()
    if (!api) return null
    try {
      return await api.getStatus()
    } catch {
      return null
    }
  }

  return {
    isDesktop,
    complete,
    transcribe,
    status
  }
}
