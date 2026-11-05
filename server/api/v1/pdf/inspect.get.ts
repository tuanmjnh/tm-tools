import { inspectFile, parseArea } from '#server/modules/pdf/inspect'
import { runPdf } from '#server/utils/pdfApi'

/** Returns rows or text for files the browser cannot render on its own. */
export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const query = getQuery(event)
    const area = parseArea(query.area)
    const name = typeof query.name === 'string' ? query.name : ''
    if (!name) throw new Error('PDF_FILE_NOT_FOUND')

    return { success: true, data: await inspectFile(area, name) }
  })
})
