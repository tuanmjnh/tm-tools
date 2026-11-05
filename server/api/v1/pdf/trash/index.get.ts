import { listTrashItems } from '#server/modules/pdf/trash'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async () => {
  return runPdf(() => {
    return { success: true, data: listTrashItems() }
  })
})
