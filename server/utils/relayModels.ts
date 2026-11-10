import type { RelayCatalogConnection } from './aiRelay'

export interface ChatModelOption {
  connectionId: string
  connectionName: string
  provider: string
  modelId: string
  displayName: string
  isPrimary?: boolean
}

/**
 * Models that cannot answer a text/vision prompt: they emit audio, images,
 * video or embeddings, or they are retrieval-only. Both pickers share this so
 * a catalogue entry is never offered by one surface and rejected by the other.
 * Catalogue ids mix bare names (`gemini-3.5-flash`), `models/` prefixes and
 * vendor prefixes (`nvidia/embed-qa-4`), so `/` counts as a token boundary too.
 */
const NON_TEXT_OUTPUT = /(?:^|[-/])(?:tts|audio|live|transcribe|image|imagen|veo|video|embedding|embed|nvclip|aqa)(?:-|$)|(?:^|[-/])(?:embedqa|lyria|clip|nano-banana|diffusion\w*)|voice/i

/** `models/gemini-3.5-flash` -> `gemini-3.5-flash`; the relay adds the prefix. */
export function bareModelId(modelId: string): string {
  return modelId.trim().replace(/^models\/\s*/, '')
}

export function isTextModel(modelId: string): boolean {
  return !NON_TEXT_OUTPUT.test(bareModelId(modelId))
}

/**
 * Flattens the relay catalogue into the chat picker shape. A connection only
 * appears when it holds a key, and a model only when it can actually answer.
 */
export function chatModelsFromCatalog(connections: RelayCatalogConnection[]): ChatModelOption[] {
  const data: ChatModelOption[] = []
  for (const connection of connections) {
    if (!connection.hasKey) continue
    for (const model of connection.models ?? []) {
      if (!model.modelId || !isTextModel(model.modelId)) continue
      data.push({
        connectionId: connection.connectionId,
        connectionName: connection.name,
        provider: connection.provider,
        modelId: model.modelId,
        displayName: model.displayName || bareModelId(model.modelId),
        isPrimary: connection.model === model.modelId
      })
    }
  }
  return data
}
