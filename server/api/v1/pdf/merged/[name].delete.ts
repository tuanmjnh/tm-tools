import { removeOutput } from '#server/modules/pdf/library'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const name = getRouterParam(event, 'name')
    if (!name) throw new Error('PDF_OUTPUT_NOT_FOUND')
    removeOutput(name)
    return { success: true, data: { name } }
  })
})
