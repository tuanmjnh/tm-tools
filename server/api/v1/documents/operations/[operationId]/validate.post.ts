import { documentCaller, runDocument, documentBody } from '#server/utils/documentApi'
import { runtimeCapabilities } from '#server/modules/document/runtime'
import { hasExecutor } from '#server/modules/document/executors'
import { DocumentError, requireOperation } from '#server/modules/document/operations'
import { extensionOf } from '#server/modules/document/staging'

interface ValidateBody {
  files?: { name?: unknown, size?: unknown }[]
  config?: unknown
}

/**
 * Pre-flight validation for the Choose step: the client learns about a rejected
 * type or an oversized selection before uploading anything.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  void caller
  const operation = requireOperation(String(getRouterParam(event, 'operationId') ?? ''))
  const body = await documentBody<ValidateBody>(event)

  return runDocument(event, () => {
    const capabilities = runtimeCapabilities()
    if (!hasExecutor(operation.id)) throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED')
    if (!capabilities.supportedOperations.includes(operation.id)) {
      throw new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED', { runtime: capabilities.runtime })
    }

    const files = Array.isArray(body.files) ? body.files : []
    const issues: { code: string, file?: string }[] = []

    if (files.length < operation.input.minFiles || files.length > operation.input.maxFiles) {
      issues.push({ code: 'DOCUMENT_INPUT_COUNT_INVALID' })
    }

    let total = 0
    for (const file of files) {
      const name = String(file.name ?? '')
      const size = Number(file.size ?? 0)
      total += size
      const extension = extensionOf(name)
      // Only the extension is known here; magic bytes are checked against the
      // uploaded content, which this pre-flight step has not seen yet.
      if (!operation.input.acceptedExtensions.includes(extension)) {
        issues.push({ code: 'DOCUMENT_INPUT_TYPE_NOT_SUPPORTED', file: name })
      }
      if (size > capabilities.maxFileBytes) issues.push({ code: 'DOCUMENT_INPUT_TOO_LARGE', file: name })
    }

    if (total > capabilities.maxTotalInputBytes) issues.push({ code: 'DOCUMENT_TOTAL_SIZE_EXCEEDED' })

    return { ok: issues.length === 0, issues, capabilities }
  })
})
