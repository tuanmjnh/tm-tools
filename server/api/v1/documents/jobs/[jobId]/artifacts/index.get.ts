import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { documentRuntime } from '#server/modules/document/runtime-context'
import { toArtifactView } from '#server/modules/document/runner'

export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const artifacts = await runtime.jobs.listArtifacts(jobId, caller.ownerId)
    if (!artifacts.length) {
      const job = await runtime.jobs.getJob(jobId, caller.ownerId)
      if (!job) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    }
    return artifacts.map(toArtifactView)
  })
})
