import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { documentRuntime } from '#server/modules/document/runtime-context'

/** Deletes one artifact: its object and its row. Ownership is rechecked. */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')
  const artifactId = String(getRouterParam(event, 'artifactId') ?? '')

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const artifact = await runtime.jobs.getArtifact(artifactId, caller.ownerId)
    if (!artifact || artifact.jobId !== jobId) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')

    if (artifact.status !== 'deleted' && artifact.status !== 'expired') {
      await runtime.delivery.remove(artifact).catch(() => undefined)
    }

    await runtime.jobs.updateArtifact({
      ...artifact,
      status: 'deleted'
    })

    return { deleted: true }
  })
})
