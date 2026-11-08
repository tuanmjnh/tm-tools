import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { documentRuntime } from '#server/modules/document/runtime-context'
import { createZipStream } from '#server/modules/document/archive'
import type { DocumentArtifactRecord } from '#shared/types/document'

/**
 * Downloads every ready artifact of one job as a single archive. Entries are
 * streamed from storage, so a multi-file result never has to be buffered.
 *
 * A single ready artifact still downloads as a ZIP here; callers that want the
 * raw file use the per-artifact download route instead.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const job = await runtime.jobs.getJob(jobId, caller.ownerId)
    if (!job) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')

    const artifacts = (await runtime.jobs.listArtifacts(jobId, caller.ownerId))
      .filter(artifact => artifact.status !== 'expired' && artifact.status !== 'deleted')
    if (artifacts.length === 0) throw new DocumentError('DOCUMENT_OUTPUT_NOT_READY')

    const now = new Date().toISOString()
    await Promise.all(artifacts.map(async (artifact: DocumentArtifactRecord) => {
      await runtime.jobs.updateArtifact({
        ...artifact,
        downloadCount: artifact.downloadCount + 1,
        firstDownloadedAt: artifact.firstDownloadedAt ?? now,
        lastDownloadedAt: now
      })
    }))

    const { stream } = createZipStream(artifacts.map(artifact => ({
      name: artifact.fileName,
      modifiedAt: new Date(artifact.createdAt),
      stream: () => runtime.storage.createReadStream({
        provider: artifact.storageProvider as 'local' | 's3-compatible',
        key: artifact.storageKey,
        ownerId: artifact.ownerId,
        size: artifact.size,
        mimeType: artifact.mimeType
      })
    })))

    const archiveName = `${job.operationId.replace(/\./g, '-')}-${job.id.slice(0, 8)}.zip`
    setHeader(event, 'content-type', 'application/zip')
    setHeader(event, 'content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`)
    setHeader(event, 'cache-control', 'no-store')

    return sendStream(event, stream)
  })
})
