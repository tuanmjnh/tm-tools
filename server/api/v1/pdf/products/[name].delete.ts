import { removeProduct } from '#server/modules/pdf/library'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const name = getRouterParam(event, 'name')
    if (!name) throw new Error('PDF_RESULT_NOT_FOUND')
    removeProduct(name)
    return { success: true, data: { name } }
  })
})
