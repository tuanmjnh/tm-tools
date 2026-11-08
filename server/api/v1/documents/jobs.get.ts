import type { DocumentJobStatus } from '#shared/types/document'
import { DOCUMENT_JOB_STATUSES } from '#shared/types/document'
import { documentCaller, runDocument } from '#server/utils/documentApi'
import { documentRuntime } from '#server/modules/document/runtime-context'
import { toView } from '#server/modules/document/runner'

export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const query = getQuery(event)

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const rawStatus = typeof query.status === 'string' ? query.status.split(',') : []
    const status = rawStatus
      .map(value => value.trim())
      .filter((value): value is DocumentJobStatus => (DOCUMENT_JOB_STATUSES as readonly string[]).includes(value))
    const limit = Math.min(Number(query.limit) || 20, 100)

    const jobs = await runtime.jobs.listJobs({
      ownerId: caller.ownerId,
      status: status.length ? status : undefined,
      operationId: typeof query.operationId === 'string' ? query.operationId : undefined,
      limit
    })

    const views = await Promise.all(jobs.map(async (job) => {
      const artifacts = await runtime.jobs.listArtifacts(job.id, caller.ownerId)
      return toView(job, artifacts)
    }))

    return views
  })
})
