import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { documentRuntime } from '#server/modules/document/runtime-context'
import { startDocumentJob } from '#server/modules/document/runner'
import { requireDispatchable } from '#server/modules/document/dispatcher'

/**
 * Runs the job. Local completes inside the request because the engines are
 * synchronous. Cloud asks the dispatcher first: a job that cannot fit this
 * runtime is refused with `DOCUMENT_WORKER_REQUIRED` before anything is
 * downloaded, so it never fails halfway through.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const job = await runtime.jobs.getJob(jobId, caller.ownerId)
    if (!job) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')

    const inputs = await runtime.jobs.listInputs(jobId, caller.ownerId)
    const pending = inputs.filter(input => input.status === 'pending' || input.status === 'uploaded')
    if (pending.length) throw new DocumentError('DOCUMENT_INPUT_NOT_READY', { pending: pending.length })

    const totalInputBytes = inputs.reduce((total, input) => total + input.size, 0)
    requireDispatchable(job, totalInputBytes)

    return startDocumentJob(
      { jobs: runtime.jobs, temp: runtime.temp, storage: runtime.storage, delivery: runtime.delivery },
      jobId,
      caller.ownerId
    )
  })
})
