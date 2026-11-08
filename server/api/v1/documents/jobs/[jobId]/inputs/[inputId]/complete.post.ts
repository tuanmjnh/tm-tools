import { documentCaller, documentBody, runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { documentRuntime } from '#server/modules/document/runtime-context'
import { completeUpload } from '#server/modules/document/uploads'

interface CompleteBody {
  uploadId?: unknown
  key?: unknown
  parts?: unknown
}

function readParts(raw: unknown): { partNumber: number, etag: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.flatMap((entry) => {
    const part = entry as { partNumber?: unknown, etag?: unknown }
    const partNumber = Number(part.partNumber)
    const etag = typeof part.etag === 'string' ? part.etag : ''
    return Number.isInteger(partNumber) && partNumber > 0 && etag ? [{ partNumber, etag }] : []
  })
}

/**
 * Finalize: verifies the stored object against the declared size before the
 * input becomes usable. A pending input is never processed.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')
  const inputId = String(getRouterParam(event, 'inputId') ?? '')
  const body = await documentBody<CompleteBody>(event)

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const job = await runtime.jobs.getJob(jobId, caller.ownerId)
    if (!job) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')

    const input = await completeUpload({
      jobs: runtime.jobs,
      storage: runtime.storage,
      job,
      inputId,
      ownerId: caller.ownerId,
      parts: readParts(body.parts),
      uploadId: typeof body.uploadId === 'string' ? body.uploadId : undefined,
      key: typeof body.key === 'string' ? body.key : undefined
    })

    return input
  })
})
