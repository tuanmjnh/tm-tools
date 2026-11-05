import { listPresets } from '#server/modules/pdf/extract/presets'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async () => {
  return runPdf(() => ({ success: true, data: listPresets() }))
})
