import { createAreaFolder } from '#server/modules/pdf/directory'
import { parseArea } from '#server/modules/pdf/inspect'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const body = await readBody<{ area?: string, folder?: string, name?: string }>(event)
    const area = parseArea(body?.area)
    const folder = body?.folder || ''
    const name = body?.name || ''
    if (!name) throw new Error('PDF_FOLDER_NAME_REQUIRED')

    const result = createAreaFolder(area, folder, name)
    return { success: true, data: result }
  })
})
