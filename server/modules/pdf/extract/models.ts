import type { H3Event } from 'h3'
import { config } from '#server/config'
import { fetchAICatalog } from '../../../utils/aiGateway'
import { bareModelId, isTextModel } from '../../../utils/relayModels'

export interface PdfExtractModel {
  connectionId: string
  connectionName: string
  provider: string
  /** Provider-side id, exactly as the relay catalogue reports it (`models/...`). */
  modelId: string
  displayName: string
  /** The deployment's suggested starting model. */
  isDefault: boolean
}

/** Where a single extraction run sends its pages. */
export interface PdfExtractTarget {
  connectionId: string
  model: string
}

const CACHE_TTL_MS = 5 * 60 * 1000

let cache: { at: number, models: PdfExtractModel[] } | null = null

/**
 * Every model of every AI connection this app may use, straight from the hub
 * catalogue. Nothing is hard-coded here, so connecting another provider (or a
 * newer model at the same provider) shows up in the picker without a deploy.
 *
 * `event` decides whose account rows are read; a list resolved for one account
 * is never cached, because the next caller would then be served that account's
 * connections. Only the env-only list (no event) keeps the short TTL.
 */
export async function listExtractModels(event?: H3Event, force = false): Promise<PdfExtractModel[]> {
  const cacheable = !event
  if (cacheable && !force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models

  const connections = await fetchAICatalog(event)
  const preferred = config.pdf.extract.model

  const models: PdfExtractModel[] = connections
    .filter(connection => connection.hasKey && connection.models?.length)
    .flatMap(connection => connection.models
      .filter(entry => entry.modelId && !entry.shadowed && isTextModel(entry.modelId))
      .map(entry => ({
        connectionId: connection.connectionId,
        connectionName: connection.name,
        provider: connection.provider,
        modelId: entry.modelId,
        displayName: entry.displayName || bareModelId(entry.modelId),
        isDefault: bareModelId(entry.modelId) === preferred
      })))

  if (models.length === 0) return []

  // The suggested model stays on top; if the provider no longer offers it, the
  // first entry becomes the default so the picker is never left unselected.
  const hasPreferred = models.some(model => model.isDefault)
  if (!hasPreferred) models[0]!.isDefault = true

  models.sort((a, b) => Number(b.isDefault) - Number(a.isDefault)
    || a.connectionName.localeCompare(b.connectionName)
    || a.displayName.localeCompare(b.displayName))

  if (cacheable) cache = { at: Date.now(), models }
  return models
}

/**
 * Catalogue ids, not paths: an app-local id keeps its `app:` namespace and a
 * local model id may carry a tag (`llama3.2:latest`). The value still has to
 * match a live catalogue entry before it is used.
 */
function isSafeId(value: string): boolean {
  return /^(?:app:)?[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
}

/**
 * Resolves what this run should call. A valid choice from the live catalogue is
 * used as-is; anything else falls back to the suggested model, then to the first
 * available one, so a stale browser tab still starts a job.
 */
export async function resolveExtractTarget(
  requested?: Partial<PdfExtractTarget> | null,
  event?: H3Event
): Promise<PdfExtractTarget> {
  const models = await listExtractModels(event)
  const connectionId = (requested?.connectionId || '').trim()
  const model = bareModelId(String(requested?.model || ''))

  if (connectionId && model && isSafeId(connectionId) && isSafeId(model)) {
    const match = models.find(entry => entry.connectionId === connectionId
      && bareModelId(entry.modelId) === model)
    if (match) return { connectionId, model }
  }

  const fallback = models.find(entry => entry.isDefault) ?? models[0]
  if (!fallback) throw new Error('PDF_AI_NO_MODEL')
  return { connectionId: fallback.connectionId, model: bareModelId(fallback.modelId) }
}
