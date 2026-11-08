import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { documentRuntime, isLocalRuntime } from '#server/modules/document/runtime-context'

/**
 * Deletes job metadata and its temporary bytes. Locally the published copies in
 * `output/` stay user data; in the cloud the private objects go with the job,
 * because there is no folder for the user to keep.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const job = await runtime.jobs.getJob(jobId, caller.ownerId)
    if (!job) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')

    if (!isLocalRuntime()) {
      const artifacts = await runtime.jobs.listArtifacts(jobId, caller.ownerId)
      for (const artifact of artifacts) {
        if (artifact.status === 'deleted' || artifact.status === 'expired') continue
        await runtime.delivery.remove(artifact).catch(() => undefined)
      }
    }

    // Mark the job expired before the bytes go, because the local manifest lives
    // in the same directory and cleanup removes it.
    await runtime.jobs.deleteJob(jobId, caller.ownerId)
    const report = await runtime.temp.cleanup(jobId)
    if (report.failed.length) throw new DocumentError('DOCUMENT_CLEANUP_FAILED', { failed: report.failed.length })
    return { deleted: true, removedBytes: report.removedBytes }
  })
})
