import { aiConfigStore, importEnvConnections, safeConnection, storeOwnerId } from '#server/utils/aiConfigStore'

export default defineEventHandler(async (event) => {
  const ownerId = storeOwnerId(event)
  const envImport = await importEnvConnections(ownerId)
  const rows = await aiConfigStore(ownerId).listConnections()
  return { success: true, data: { connections: rows.map(safeConnection), envImport } }
})
