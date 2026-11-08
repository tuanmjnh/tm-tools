import type { H3Event } from 'h3'
import { config } from '#server/config'
import { documentRuntime, isLocalRuntime } from './runtime-context'
import { cleanupAbandonedInputs, runArtifactCleanup } from './retention'

/**
 * Retention sweep behind a bearer token. The scheduler proves itself with the
 * configured cleanup token; a platform cron secret is accepted too so a Vercel
 * Cron needs no extra header plumbing. The local runtime runs its own
 * filesystem janitor at boot, so this answers a no-op there.
 */
export async function sweepRetention(event: H3Event): Promise<unknown> {
  const expected = [config.document.cleanupToken, process.env.CRON_SECRET ?? ''].filter(Boolean)
  if (!expected.length) {
    throw createError({
      statusCode: 503,
      statusMessage: 'DOCUMENT_CLEANUP_FAILED',
      message: 'Cleanup is not configured'
    })
  }

  const header = getHeader(event, 'authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token || !expected.includes(token)) {
    throw createError({ statusCode: 401, statusMessage: 'error.tokenMissing', message: 'Missing cleanup token' })
  }

  if (isLocalRuntime()) return { skipped: true, reason: 'local-runtime-cleans-at-boot' }

  const runtime = await documentRuntime(event)
  const artifacts = await runArtifactCleanup({ jobs: runtime.jobs, storage: runtime.storage })
  const inputs = await cleanupAbandonedInputs(runtime.jobs, runtime.storage)
  return { skipped: false, artifacts, inputs }
}
