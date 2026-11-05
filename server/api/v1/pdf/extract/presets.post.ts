import { savePreset } from '#server/modules/pdf/extract/presets'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const body = await readBody<Record<string, unknown>>(event) || {}
    return { success: true, data: savePreset(body) }
  })
})
