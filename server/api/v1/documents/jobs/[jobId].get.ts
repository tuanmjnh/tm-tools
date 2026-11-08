import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { documentRuntime } from '#server/modules/document/runtime-context'
import { jobView } from '#server/modules/document/runner'

export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const view = await jobView(
      { jobs: runtime.jobs, temp: runtime.temp, storage: runtime.storage, delivery: runtime.delivery },
      jobId,
      caller.ownerId
    )
    if (!view) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    return view
  })
})
