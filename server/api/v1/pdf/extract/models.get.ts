import { listExtractModels } from '#server/modules/pdf/extract/models'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const force = getQuery(event).refresh === '1'
    return { success: true, data: await listExtractModels(force) }
  })
})
