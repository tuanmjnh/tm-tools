import { runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { detectRuntime } from '#server/modules/document/runtime'
import { isInstalling, installProgress, modelStatus } from '#server/modules/image/model-installer'

/**
 * Read-only state of the ISNet segmentation model for the background-remove AI
 * mode. Reports install/verify state plus the size the client shows before a
 * 178 MB download starts — never the bytes themselves.
 */
export default defineEventHandler(async (event) => {
  return runDocument(event, async () => {
    if (detectRuntime() === 'vercel') throw new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED')
    const status = modelStatus()
    return {
      installed: status.installed,
      verified: status.verified,
      bytes: status.bytes,
      expectedBytes: status.expectedBytes,
      version: status.version,
      sha256: status.sha256,
      url: status.url,
      installing: isInstalling(),
      progress: installProgress()
    }
  })
})
