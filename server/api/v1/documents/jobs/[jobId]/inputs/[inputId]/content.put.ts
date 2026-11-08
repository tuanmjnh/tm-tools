import { Readable } from 'node:stream'
import { getRequestWebStream } from 'h3'
import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { documentRuntime, isLocalRuntime } from '#server/modules/document/runtime-context'

/**
 * Body sink for a provider whose upload target is this API rather than a
 * provider-signed grant. No current cloud adapter points here: R2 returns a
 * presigned PUT and Hub returns its own short-lived grant directly to the
 * signed-in browser. The route is kept as the generic fallback, and it still
 * refuses to buffer: the body streams into the provider, gated by the size
 * the intent declared.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  const jobId = String(getRouterParam(event, 'jobId') ?? '')
  const inputId = String(getRouterParam(event, 'inputId') ?? '')

  return runDocument(event, async () => {
    if (isLocalRuntime()) {
      throw new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED', { reason: 'local-runtime-uses-form-post' })
    }

    const runtime = await documentRuntime(event)
    const job = await runtime.jobs.getJob(jobId, caller.ownerId)
    if (!job) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    if (job.status !== 'uploading' && job.status !== 'created') {
      throw new DocumentError('DOCUMENT_JOB_STATE_INVALID', { status: job.status })
    }

    const inputs = await runtime.jobs.listInputs(jobId, caller.ownerId)
    const input = inputs.find(entry => entry.id === inputId)
    if (!input) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    if (input.status !== 'pending') {
      throw new DocumentError('DOCUMENT_JOB_STATE_INVALID', { status: input.status })
    }

    const declared = Number(getHeader(event, 'content-length') ?? 0)
    if (declared > input.size) {
      throw new DocumentError('DOCUMENT_INPUT_TOO_LARGE', { size: declared, declaredSize: input.size })
    }

    const body = getRequestWebStream(event)
    if (!body) throw new DocumentError('DOCUMENT_INPUT_REQUIRED', { fileName: input.originalName })

    const stored = await runtime.storage.putObject({
      ownerId: input.ownerId,
      key: input.storageKey,
      data: Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
      mimeType: input.mimeType,
      size: input.size
    })

    return { inputId: input.id, key: stored.key, size: stored.size }
  })
})
