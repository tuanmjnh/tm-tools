import { runDocument } from '#server/utils/documentApi'
import { requireJobRoutes } from '#server/modules/document/runtime-context'

/**
 * A job created on an ephemeral host lives inside one invocation, so every
 * route that addresses a job by id would answer 404 for a link that cannot
 * exist. Refusing here names the supported path (`POST /api/v1/documents/run`)
 * instead of pretending the job is missing.
 *
 * Local and durable cloud runtimes pass untouched; only the path prefix is
 * inspected, so this costs nothing on the filesystem path.
 */
export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/v1/documents/jobs')) return
  await runDocument(event, () => requireJobRoutes())
})
