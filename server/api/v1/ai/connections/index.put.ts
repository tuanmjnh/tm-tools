import type { StoredAIModel } from '@tuanmjnh/tm-ai-client'
import { aiConfigStore, requireAIConfigSecret, safeConnection, sealForKey, storeOwnerId } from '../../../../utils/aiConfigStore'

interface Body {
  connectionId?: string
  providerKey?: string
  baseUrl?: string
  apiKey?: string
  apiKeyEnv?: string
  enabled?: boolean
  models?: Array<{ modelId: string, displayName?: string, enabled?: boolean, isPrimary?: boolean }>
}

export default defineEventHandler(async (event) => {
  const ownerId = storeOwnerId(event)
  const body = await readBody<Body>(event)
  if (!body?.connectionId || !body.providerKey) {
    throw createError({ statusCode: 400, statusMessage: 'error.badRequest', message: 'connectionId and providerKey are required' })
  }
  const store = aiConfigStore(ownerId)
  const existing = (await store.listConnections()).find(row => row.connectionId === body.connectionId)
  const typedKey = String(body.apiKey ?? '').trim()
  // An absent/empty key input keeps the stored cipher: the form never echoes it.
  const apiKeyCipher = typedKey ? await sealForKey(typedKey) : existing?.apiKeyCipher ?? ''
  if (apiKeyCipher) requireAIConfigSecret()

  const models: StoredAIModel[] = (body.models ?? existing?.models ?? []).map(model => ({
    modelId: String(model.modelId || '').trim(),
    ...(model.displayName ? { displayName: String(model.displayName) } : {}),
    enabled: model.enabled !== false,
    ...(model.isPrimary ? { isPrimary: true } : {})
  })).filter(model => model.modelId)

  const saved = await store.upsertConnection({
    connectionId: body.connectionId,
    providerKey: body.providerKey,
    baseUrl: body.baseUrl ?? existing?.baseUrl ?? '',
    apiKeyCipher,
    ...(String(body.apiKeyEnv ?? existing?.apiKeyEnv ?? '').trim()
      ? { apiKeyEnv: String(body.apiKeyEnv ?? existing?.apiKeyEnv ?? '').trim() }
      : {}),
    enabled: body.enabled ?? existing?.enabled ?? true,
    models
  })
  return { success: true, data: safeConnection(saved) }
})
