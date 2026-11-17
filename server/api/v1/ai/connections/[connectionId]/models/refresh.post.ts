import { createAIClient, type StoredAIModel } from '@tuanmjnh/tm-ai-client'
import { aiConfigStore, openConnectionKey, storeOwnerId } from '#server/utils/aiConfigStore'
import { requireRootAuth } from '#server/utils/authz'

export default defineEventHandler(async (event) => {
  requireRootAuth(event)
  const ownerId = storeOwnerId(event)
  const connectionId = getRouterParam(event, 'connectionId')
  if (!connectionId) throw createError({ statusCode: 400, statusMessage: 'error.badRequest', message: 'connectionId is required' })

  const store = aiConfigStore(ownerId)
  const record = (await store.listConnections()).find(row => row.connectionId === connectionId)
  if (!record) throw createError({ statusCode: 404, statusMessage: 'error.notFound', message: 'Unknown connection' })

  const client = createAIClient({
    endpoint: {
      provider: record.providerKey,
      baseUrl: record.baseUrl,
      apiKey: await openConnectionKey(record),
      mode: 'local'
    },
    timeoutMs: 15_000,
    assertModeAllowed: () => {}
  })

  let listed
  try {
    listed = await client.listModels()
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: 'error.aiLocalUpstreamFailed',
      message: `Model discovery failed: ${(err as Error).message}`
    })
  }

  const previous = new Map(record.models.map(model => [model.modelId, model]))
  const models: StoredAIModel[] = listed.models.map((model) => {
    const before = previous.get(model.id)
    return {
      modelId: model.id,
      ...(before?.displayName ? { displayName: before.displayName } : {}),
      enabled: before?.enabled ?? true,
      ...(before?.isPrimary ? { isPrimary: true } : {})
    }
  })
  if (models.length && !models.some(model => model.isPrimary)) models[0]!.isPrimary = true

  await store.replaceModels(connectionId, models)
  return { success: true, data: { total: models.length, enabled: models.filter(model => model.enabled).length } }
})
