import { aiConfigStore, importEnvConnections, safeConnection, storeOwnerId } from '#server/utils/aiConfigStore'
import { requireRootAuth } from '#server/utils/authz'

export default defineEventHandler(async (event) => {
  requireRootAuth(event)
  const ownerId = storeOwnerId(event)
  const envImport = await importEnvConnections(ownerId)
  const rows = await aiConfigStore(ownerId).listConnections()
  return { success: true, data: { connections: rows.map(safeConnection), envImport } }
})
