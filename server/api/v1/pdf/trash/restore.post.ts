import { restoreTrashItem } from '#server/modules/pdf/trash'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const body = await readBody<{ id?: string }>(event)
    const id = body?.id
    if (!id) throw new Error('PDF_TRASH_ITEM_NOT_FOUND')

    const item = restoreTrashItem(id)
    return { success: true, data: item }
  })
})
