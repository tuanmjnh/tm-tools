import { documentCaller, documentBody, runDocument } from '#server/utils/documentApi'
import { DocumentError, requireOperation } from '#server/modules/document/operations'
import { documentRuntime, requireOperationSupport } from '#server/modules/document/runtime-context'
import { isEphemeralRuntime, preferredStorageDriver } from '#server/modules/document/runtime'
import { declareUpload } from '#server/modules/document/uploads'

interface DeclareBody {
  fileName?: unknown
  size?: unknown
  mimeType?: unknown
}

/**
 * Cloud upload intent. The browser gets a short-lived signed PUT (or a
 * multipart plan) so the bytes never pass through the Function body. Local
 * uploads keep using the multipart staging route instead.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')
  const body = await documentBody<DeclareBody>(event)

  return runDocument(event, async () => {
    // Only a bucket can back a signed plan. An ephemeral cloud has none, and
    // its jobs never leave the `/run` request that created them.
    if (isEphemeralRuntime() || !preferredStorageDriver()) {
      throw new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED', { reason: 'use-single-request-run' })
    }

    const runtime = await documentRuntime(event)
    const job = await runtime.jobs.getJob(jobId, caller.ownerId)
    if (!job) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    if (job.status !== 'created' && job.status !== 'uploading') {
      throw new DocumentError('DOCUMENT_JOB_STATE_INVALID', { status: job.status })
    }

    const operation = requireOperation(job.operationId)
    requireOperationSupport(operation.id)

    const existing = await runtime.jobs.listInputs(jobId, caller.ownerId)
    const declared = await declareUpload({
      job,
      operation,
      existingCount: existing.length,
      fileName: String(body.fileName ?? ''),
      size: Number(body.size ?? 0),
      mimeType: typeof body.mimeType === 'string' ? body.mimeType : undefined,
      maxFileBytes: runtime.capabilities.maxFileBytes,
      storage: runtime.storage
    })

    await runtime.jobs.addInput(declared.input)
    if (job.status === 'created') await runtime.jobs.updateStatus(jobId, { to: 'uploading' })

    return { input: declared.input, plan: declared.plan }
  })
})
