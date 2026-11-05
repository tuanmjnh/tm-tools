import { deleteAreaItem } from '#server/modules/pdf/directory'
import { parseArea } from '#server/modules/pdf/inspect'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const body = await readBody<{ area?: string, path?: string }>(event)
    const area = parseArea(body?.area)
    const path = body?.path || ''
    if (!path) throw new Error('PDF_INVALID_PATH')

    const result = deleteAreaItem(area, path)
    return { success: true, data: result }
  })
})
