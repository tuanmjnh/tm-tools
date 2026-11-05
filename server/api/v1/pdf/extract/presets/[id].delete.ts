import { deletePreset } from '#server/modules/pdf/extract/presets'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const id = String(getRouterParam(event, 'id') || '').trim()
    // Deleting a preset that is already gone is not an error for the caller.
    return { success: true, data: { deleted: id ? deletePreset(id) : false } }
  })
})
