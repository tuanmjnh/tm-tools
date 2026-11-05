import { removeOffice } from '#server/modules/pdf/library'
import { runPdf, pathParam } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_OFFICE_NOT_FOUND')

    removeOffice(name)
    return { success: true, data: { deleted: true } }
  })
})
