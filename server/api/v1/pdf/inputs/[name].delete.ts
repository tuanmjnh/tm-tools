import { removeInput } from '#server/modules/pdf/inputs'
import { runPdf, pathParam } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_INPUT_NOT_FOUND')

    removeInput(name)
    return { success: true, data: { removed: name } }
  })
})
