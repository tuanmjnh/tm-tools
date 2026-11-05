import { renameAreaItem } from '#server/modules/pdf/directory'
import { parseArea } from '#server/modules/pdf/inspect'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const body = await readBody<{ area?: string, path?: string, newName?: string }>(event)
    const area = parseArea(body?.area)
    const path = body?.path || ''
    const newName = body?.newName || ''
    if (!path) throw new Error('PDF_INVALID_PATH')
    if (!newName) throw new Error('PDF_NAME_REQUIRED')

    const result = renameAreaItem(area, path, newName)
    return { success: true, data: result }
  })
})
