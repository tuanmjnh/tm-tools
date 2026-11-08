import { startExtraction } from '#server/modules/pdf/extract/jobs'
import { sanitizeInstructions } from '#server/modules/pdf/extract/presets'
import { runPdf, overwriteFlag } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const body = await readBody<{
      source?: unknown
      force?: unknown
      overwrite?: unknown
      model?: unknown
      connectionId?: unknown
      preset?: unknown
      formats?: unknown
    }>(event) || {}
    const source = typeof body.source === 'string' ? body.source.trim() : ''
    if (!source) throw new Error('PDF_SOURCE_NOT_FOUND')

    const formats = Array.isArray(body.formats)
      ? body.formats.filter((f): f is string => typeof f === 'string')
      : null

    // Both values describe one entry of the live model catalogue; the module
    // falls back to the suggested model when they are missing or stale. The
    // preset carries the operator's own guidance and example for this run.
    const job = await startExtraction(
      source,
      body.force === true,
      {
        connectionId: typeof body.connectionId === 'string' ? body.connectionId.trim() : '',
        model: typeof body.model === 'string' ? body.model.trim() : ''
      },
      sanitizeInstructions(body.preset),
      overwriteFlag(body.overwrite),
      formats
    )
    return { success: true, data: job }
  })
})
