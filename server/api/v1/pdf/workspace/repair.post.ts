import { runPdf } from '#server/utils/pdfApi'
import { repairWorkspace } from '#server/modules/pdf/workspace'

export default defineEventHandler(async () => {
  return runPdf(() => ({ success: true, data: repairWorkspace() }))
})
