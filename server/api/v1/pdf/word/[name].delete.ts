import { removeWord } from '#server/modules/pdf/library'
import { runPdf, pathParam } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_WORD_NOT_FOUND')

    removeWord(name)
    return { success: true, data: { deleted: true } }
  })
})
