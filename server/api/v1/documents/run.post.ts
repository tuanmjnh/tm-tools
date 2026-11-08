import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { documentCaller, runDocument } from '#server/utils/documentApi'
import { DocumentError, requireOperation } from '#server/modules/document/operations'
import { documentRuntime, requireOperationSupport } from '#server/modules/document/runtime-context'
import { isEphemeralRuntime } from '#server/modules/document/runtime'
import { stageInput, validateCount } from '#server/modules/document/staging'
import { createDraftJob, startDocumentJob, attachInlineBytes } from '#server/modules/document/runner'
import { jobOutputDir } from '#server/modules/document/paths'

/**
 * One-request run for an ephemeral cloud host.
 *
 * A serverless deployment without a bucket has no storage that survives the
 * request, so the whole job — create, stage, execute, hand back — must happen
 * inside this invocation, and the result travels in the response body. Any
 * other shape would return a `downloadPath` that is already dead.
 *
 * Bodies are base64 here on purpose: the client gets the bytes without a second
 * round trip, and the capability caps keep the response inside the platform
 * payload limit.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)

  return runDocument(event, async () => {
    if (!isEphemeralRuntime()) {
      throw new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED', { reason: 'use-job-routes' })
    }

    const parts = await readMultipartFormData(event)
    if (!parts?.length) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')

    const configPart = parts.find(part => part.name === 'config')
    const operationPart = parts.find(part => part.name === 'operationId')
    const operationId = operationPart?.data.toString('utf8').trim() ?? ''
    if (!operationId) throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED')

    let config: Record<string, unknown> = {}
    if (configPart?.data?.length) {
      try {
        const parsed = JSON.parse(configPart.data.toString('utf8'))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed as Record<string, unknown>
      } catch {
        throw new DocumentError('DOCUMENT_OPERATION_CONFIG_INVALID', { reason: 'config-not-json' })
      }
    }

    const files = parts.filter(part => part.name === 'files' && part.filename && part.data?.length)
    if (!files.length) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')

    const runtime = await documentRuntime(event)
    const operation = requireOperation(operationId)
    requireOperationSupport(operation.id)
    validateCount(operation, files.length)

    const deps = {
      jobs: runtime.jobs,
      temp: runtime.temp,
      storage: runtime.storage,
      delivery: runtime.delivery
    }

    const total = files.reduce((sum, part) => sum + (part.data?.length ?? 0), 0)
    if (total > runtime.capabilities.maxTotalInputBytes) {
      throw new DocumentError('DOCUMENT_TOTAL_SIZE_EXCEEDED', {
        total,
        limit: runtime.capabilities.maxTotalInputBytes
      })
    }

    const job = await createDraftJob(deps, {
      ownerId: caller.ownerId,
      operationId: operation.id,
      runtime: runtime.capabilities.runtime,
      config
    })

    try {
      for (const part of files) {
        const staged = stageInput({
          jobId: job.id,
          ownerId: caller.ownerId,
          operation,
          fileName: part.filename ?? 'file',
          data: part.data!,
          declaredMime: part.type,
          expiresAt: job.expiresAt,
          maxFileBytes: runtime.capabilities.maxFileBytes
        })
        await runtime.jobs.addInput(staged.record)
      }

      const finished = await startDocumentJob(deps, job.id, caller.ownerId)
      const bodies = new Map<string, string>()
      for (const artifact of finished.artifacts) {
        // The published copy is the only readable one: staging is released by
        // the runner's `finally`.
        const path = join(jobOutputDir(job.id), artifact.fileName)
        bodies.set(artifact.id, readFileSync(path).toString('base64'))
      }

      return attachInlineBytes(finished, bodies)
    } finally {
      await runtime.temp.cleanup(job.id).catch(() => undefined)
    }
  })
})
