import { isEphemeralRuntime, operationSupport, preferredStorageDriver, runtimeCapabilities, storageMode }
  from '#server/modules/document/runtime'
import { hasExecutor } from '#server/modules/document/executors'
import { isDatabaseConfigured, databaseHealth } from '#server/modules/document/postgres-client'

/**
 * Deployment health for Document Studio. It names the runtime, the selected
 * storage driver and whether that driver can persist anything, and never
 * returns a connection string, bucket name, credential or signed URL.
 *
 * A Hub deployment answers `requiresSession: true`: the bytes are reachable
 * only for a signed-in caller, because every gateway call carries that user's
 * token. This route is public, so it reports the capability and not a verdict
 * on whichever monitor called it.
 */
export default defineEventHandler(async () => {
  const capabilities = runtimeCapabilities()
  const local = capabilities.runtime === 'local' || capabilities.runtime === 'electron'
  const driver = preferredStorageDriver()
  const database = local
    ? { configured: false, connected: false }
    : {
        configured: isDatabaseConfigured(),
        connected: isDatabaseConfigured() ? (await databaseHealth()).ok : false
      }

  const storage = local
    ? { driver: 'local' as const, persistent: true, requiresSession: false }
    : driver === 'hub'
      ? { driver: 'hub' as const, persistent: true, requiresSession: true }
      : driver === 'r2'
        ? { driver: 'r2' as const, persistent: true, requiresSession: false }
        : { driver: 'none' as const, persistent: false, requiresSession: true }

  return {
    runtime: capabilities.runtime,
    storage: {
      ...storage,
      mode: storageMode(),
      ephemeral: isEphemeralRuntime(),
      configured: local || driver !== null
    },
    database,
    operations: capabilities.supportedOperations
      // Same rule as the catalogue: an operation without a v4 executor is not
      // reported as runnable just because the runtime allows it.
      .filter(hasExecutor)
      .map(id => ({
        id,
        enabled: operationSupport(id).enabled
      })),
    limits: {
      maxFileBytes: capabilities.maxFileBytes,
      maxTotalInputBytes: capabilities.maxTotalInputBytes,
      maxInputFiles: capabilities.maxInputFiles,
      maxTempBytes: capabilities.maxTempBytes,
      maxInlineDurationMs: capabilities.maxInlineDurationMs
    }
  }
})
