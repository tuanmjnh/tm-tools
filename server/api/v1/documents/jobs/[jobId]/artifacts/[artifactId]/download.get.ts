import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { documentRuntime } from '#server/modules/document/runtime-context'

/** Types a browser or the OS can render in place instead of saving. */
const INLINE_PREVIEW_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/json'
])

/**
 * Authorized artifact download. The job is checked against the caller's owner
 * id before any byte is opened, so a guessed artifact id is useless.
 *
 * Local and Hub stream through this route: Hub's grant is a provider-side
 * credential that must never reach the browser, so there is nothing to redirect
 * to. R2 owns its own bucket and redirects to a short-lived signed GET instead.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')
  const artifactId = String(getRouterParam(event, 'artifactId') ?? '')

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const artifact = await runtime.jobs.getArtifact(artifactId, caller.ownerId)
    // A missing artifact and someone else's artifact answer the same way, so the
    // route never confirms that an id exists for another user.
    if (!artifact || artifact.jobId !== jobId) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    if (artifact.status === 'expired' || artifact.status === 'deleted') {
      throw new DocumentError('DOCUMENT_ARTIFACT_EXPIRED')
    }

    const ref = {
      provider: artifact.storageProvider as 'local' | 's3-compatible',
      key: artifact.storageKey,
      ownerId: artifact.ownerId,
      size: artifact.size,
      mimeType: artifact.mimeType
    }

    // `?inline=1` lets the desktop/browser preview tab render PDFs and images
    // instead of forcing a save; anything else stays an attachment.
    const wantsInline = String(getQuery(event).inline ?? '') === '1'
    const inline = wantsInline && INLINE_PREVIEW_MIME.has(artifact.mimeType)

    const updated = {
      ...artifact,
      status: 'downloaded' as const,
      downloadCount: artifact.downloadCount + 1,
      firstDownloadedAt: artifact.firstDownloadedAt ?? new Date().toISOString(),
      lastDownloadedAt: new Date().toISOString()
    }
    await runtime.jobs.updateArtifact(updated)

    if (runtime.storage.createDownloadUrl) {
      const url = await runtime.storage.createDownloadUrl(ref, artifact.fileName)
      setHeader(event, 'cache-control', 'no-store')
      await sendRedirect(event, url, 302)
      return null
    }

    setHeader(event, 'content-type', artifact.mimeType)
    setHeader(event, 'content-length', artifact.size)
    setHeader(event, 'x-content-type-options', 'nosniff')
    setHeader(
      event,
      'content-disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`
    )
    setHeader(event, 'cache-control', 'no-store')

    return sendStream(event, await runtime.storage.createReadStream(ref))
  })
})
