import { exportSource, normalizeFormats } from '#server/modules/pdf/source-export'
import { runPdf, pathParam, overwriteFlag } from '#server/utils/pdfApi'

/** Body: `{ formats: ['png', 'docx', 'xlsx', 'csv', 'json', 'xml'], overwrite?: boolean }`. */
export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_SOURCE_NOT_FOUND')

    const body = await readBody<{ formats?: unknown, overwrite?: unknown }>(event) || {}
    const formats = normalizeFormats(body.formats)
    if (!formats.length) throw new Error('PDF_EXPORT_NO_FORMAT')

    const results = await exportSource(name, formats, overwriteFlag(body.overwrite))
    return { success: true, data: results }
  })
})
