import { deleteTrashItemPermanently } from '#server/modules/pdf/trash'
import { runPdf, pathParam } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const id = pathParam(getRouterParam(event, 'id'))
    if (!id) throw new Error('PDF_TRASH_ITEM_NOT_FOUND')

    deleteTrashItemPermanently(id)
    return { success: true, data: { id } }
  })
})
