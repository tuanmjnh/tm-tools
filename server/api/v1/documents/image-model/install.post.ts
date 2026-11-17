import { runDocument } from '#server/utils/documentApi'
import { DocumentError } from '#server/modules/document/operations'
import { installModel, isInstalling, modelStatus } from '#server/modules/image/model-installer'

/**
 * Downloads and verifies the ISNet model from its official release into the
 * writable data directory. Single-flight: a second request while a download is
 * in progress joins the run instead of starting another 178 MB transfer. Local
 * and Electron only — a hosted runtime has no writable install dir and cannot
 * serve the AI mode anyway.
 */
export default defineEventHandler(async (event) => {
  return runDocument(event, async () => {
    if (isInstalling()) {
      const status = modelStatus()
      return { started: false, installing: true, ...status }
    }

    try {
      const result = await installModel()
      return { started: true, installed: true, bytes: result.bytes }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('MODEL_HASH_MISMATCH')) {
        throw new DocumentError('DOCUMENT_IMAGE_MODEL_UNAVAILABLE', { reason: 'hash-mismatch' })
      }
      throw new DocumentError('DOCUMENT_IMAGE_MODEL_UNAVAILABLE', { reason: 'download-failed' })
    }
  })
})
