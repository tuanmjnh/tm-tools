import { removeSource } from '#server/modules/pdf/library'
import { runPdf, pathParam } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_SOURCE_NOT_FOUND')
    removeSource(name)
    return { success: true, data: { name } }
  })
})
