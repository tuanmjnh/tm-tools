import type { DocumentOperationDefinition } from '#shared/types/document'
import { documentCaller, runDocument } from '#server/utils/documentApi'
import { operationSupport, runtimeCapabilities } from '#server/modules/document/runtime'
import { DOCUMENT_OPERATIONS } from '#server/modules/document/operations'
import { hasExecutor } from '#server/modules/document/executors'

/**
 * Client-safe catalogue. `available` folds executor presence, per-operation
 * runtime support and the disabled flag so the UI never offers a tool the
 * current runtime cannot actually run.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  void caller

  return runDocument(event, () => {
    const capabilities = runtimeCapabilities()
    const operations = DOCUMENT_OPERATIONS
      .filter(operation => hasExecutor(operation.id))
      .map((operation) => {
        const support = operationSupport(operation.id, capabilities.runtime)
        return {
          ...operation,
          available: operation.enabled && support.enabled,
          runtimeSupport: support
        }
      })

    return {
      runtime: capabilities.runtime,
      capabilities,
      operations
    }
  })
})

export type DocumentOperationCatalogEntry = DocumentOperationDefinition & { available: boolean }
