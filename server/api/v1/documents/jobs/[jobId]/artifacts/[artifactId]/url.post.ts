import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { documentRuntime } from '#server/modules/document/runtime-context'

interface ArtifactSummary {
  id: string
  fileName: string
  mimeType: string
  size: number
  expiresAt: string
}

/**
 * One-shot download link. Parallel artifact downloads open this many times; the
 * URL is short-lived and never stored in the job record.
 *
 * Only a deployment that owns its bucket can mint one. Hub grants stay inside
 * this server, so those answers are the authenticated download route itself.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')
  const artifactId = String(getRouterParam(event, 'artifactId') ?? '')

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const artifact = await runtime.jobs.getArtifact(artifactId, caller.ownerId)
    if (!artifact || artifact.jobId !== jobId) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    if (artifact.status === 'expired' || artifact.status === 'deleted') {
      throw new DocumentError('DOCUMENT_ARTIFACT_EXPIRED')
    }

    const summary: ArtifactSummary = {
      id: artifact.id,
      fileName: artifact.fileName,
      mimeType: artifact.mimeType,
      size: artifact.size,
      expiresAt: artifact.expiresAt
    }

    const downloadPath = `/api/v1/documents/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}/download`
    if (!runtime.storage.createDownloadUrl) return { artifact: summary, url: downloadPath }

    const url = await runtime.storage.createDownloadUrl({
      provider: artifact.storageProvider as 'local' | 's3-compatible',
      key: artifact.storageKey,
      ownerId: artifact.ownerId,
      size: artifact.size,
      mimeType: artifact.mimeType
    }, artifact.fileName)
    return { artifact: summary, url }
  })
})
