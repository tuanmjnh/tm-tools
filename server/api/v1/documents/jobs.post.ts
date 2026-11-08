import { documentCaller, runDocument, documentBody } from '#server/utils/documentApi'
import { DocumentError, requireOperation } from '#server/modules/document/operations'
import { documentRuntime, requireOperationSupport } from '#server/modules/document/runtime-context'
import { MAX_RETENTION_DAYS, createDraftJob, toView } from '#server/modules/document/runner'

interface CreateJobBody {
  operationId?: unknown
  config?: unknown
  retentionDays?: unknown
  idempotencyKey?: unknown
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/

/**
 * Creates the draft job. Inputs are uploaded afterwards, which is what lets a
 * large file avoid the Function body limit in a cloud runtime.
 *
 * A retry token may arrive in the body or the `Idempotency-Key` header. Repeat
 * creates with the same owner + token return the first job instead of a
 * duplicate.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const body = await documentBody<CreateJobBody>(event)
  const operationId = typeof body.operationId === 'string' ? body.operationId : ''
  if (!operationId) throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED')

  const headerKey = getHeader(event, 'idempotency-key')
  const candidate = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : headerKey
  const idempotencyKey = candidate && IDEMPOTENCY_KEY.test(candidate) ? candidate : undefined

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const operation = requireOperation(operationId)
    requireOperationSupport(operation.id)

    const retentionDays = typeof body.retentionDays === 'number' && body.retentionDays > 0
      ? Math.min(Math.floor(body.retentionDays), MAX_RETENTION_DAYS)
      : undefined

    const job = await createDraftJob(
      {
        jobs: runtime.jobs,
        temp: runtime.temp,
        storage: runtime.storage,
        delivery: runtime.delivery
      },
      {
        ownerId: caller.ownerId,
        operationId: operation.id,
        runtime: runtime.capabilities.runtime,
        config: (body.config && typeof body.config === 'object' ? body.config : {}) as Record<string, unknown>,
        retentionDays,
        idempotencyKey
      }
    )

    return toView(job, [])
  })
})
