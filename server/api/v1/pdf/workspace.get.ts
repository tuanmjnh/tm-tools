import { runPdf } from '#server/utils/pdfApi'
import { workspaceReport } from '#server/modules/pdf/workspace'

export default defineEventHandler(async () => {
  return runPdf(() => ({ success: true, data: workspaceReport() }))
})
