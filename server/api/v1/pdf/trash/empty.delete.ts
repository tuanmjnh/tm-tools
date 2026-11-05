import { emptyTrash } from '#server/modules/pdf/trash'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async () => {
  return runPdf(() => {
    emptyTrash()
    return { success: true, data: { emptied: true } }
  })
})
