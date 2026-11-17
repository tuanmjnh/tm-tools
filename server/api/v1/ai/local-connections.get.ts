import { aiConfigStore, safeConnection, storeOwnerId } from '#server/utils/aiConfigStore'
import { requireRootAuth } from '#server/utils/authz'
import { describeLocalConnections } from '#server/utils/aiGateway'

/**
 * Connection view for the settings surface: the signed-in account's rows, or
 * the machine-level env configuration for an anonymous caller.
 *
 * Never returns a key: `hasKey` is all the settings surface needs.
 */
export default defineEventHandler(async (event) => {
  requireRootAuth(event)
  if (event.context.auth) {
    const rows = (await aiConfigStore(storeOwnerId(event)).listConnections()).map(safeConnection)
    return { success: true, data: { connections: rows, errors: [], envVar: 'AI_LOCAL_CONNECTIONS' } }
  }
  // The auth middleware 401s every /api/ path and the guard above refuses
  // non-root, so this env branch is unreachable over HTTP; it is kept as the
  // machine-level view rather than a second, weaker authorization path.
  const { connections, errors } = describeLocalConnections(event)
  return { success: true, data: { connections, errors, envVar: 'AI_LOCAL_CONNECTIONS' } }
})
