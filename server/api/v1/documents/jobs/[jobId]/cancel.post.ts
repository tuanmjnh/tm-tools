import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { documentRuntime } from '#server/modules/document/runtime-context'

export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const job = await runtime.jobs.getJob(jobId, caller.ownerId)
    if (!job) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    if (job.status === 'running' || job.status === 'publishing') {
      await runtime.jobs.updateStatus(jobId, { to: 'cancel_requested' })
      await runtime.jobs.updateStatus(jobId, { to: 'cancelled' })
    } else if (job.status === 'queued' || job.status === 'uploading') {
      await runtime.jobs.updateStatus(jobId, { to: 'cancelled' })
    } else {
      throw new DocumentError('DOCUMENT_JOB_STATE_INVALID', { status: job.status })
    }

    return { cancelled: true }
  })
})
