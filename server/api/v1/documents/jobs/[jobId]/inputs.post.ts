import type { DocumentJobInputRecord } from '#shared/types/document'
import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError, requireOperation } from '#server/modules/document/operations'
import { documentRuntime, isLocalRuntime, requireOperationSupport } from '#server/modules/document/runtime-context'
import { isEphemeralRuntime } from '#server/modules/document/runtime'
import { stageInput, validateCount } from '#server/modules/document/staging'

/**
 * Local upload path: the browser POSTs the picked bytes and they are staged
 * straight into the job input directory. A cloud runtime declares the upload
 * first and PUTs straight to storage, so this route refuses there instead of
 * buffering a large body inside a Function.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')

  return runDocument(event, async () => {
    // A signed upload plan needs a bucket. Without one the cloud runtime is
    // ephemeral and has no job routes at all — the single-request `/run` path
    // is the only supported shape.
    if (!isLocalRuntime()) {
      throw new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED', {
        reason: isEphemeralRuntime() ? 'use-single-request-run' : 'use-upload-intent'
      })
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

    const parts = await readMultipartFormData(event)
    if (!parts?.length) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')

    const incoming = parts.filter(part => part.name === 'files' && part.filename && part.data?.length)
    if (!incoming.length) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')

    validateCount(operation, existing.length + incoming.length)

    const staged: DocumentJobInputRecord[] = []
    let total = 0
    for (const part of incoming) {
      const result = stageInput({
        jobId,
        ownerId: caller.ownerId,
        operation,
        fileName: part.filename ?? 'file',
        data: part.data,
        declaredMime: part.type,
        expiresAt: job.expiresAt,
        maxFileBytes: runtime.capabilities.maxFileBytes
      })
      total += result.record.size
      if (total > runtime.capabilities.maxTotalInputBytes) {
        throw new DocumentError('DOCUMENT_TOTAL_SIZE_EXCEEDED', { total })
      }
      await runtime.jobs.addInput(result.record)
      staged.push(result.record)
    }

    if (job.status === 'created' && staged.length) {
      await runtime.jobs.updateStatus(jobId, { to: 'uploading' })
    }

    return staged
  })
})
