import { cancelJob } from '#server/modules/pdf/extract/jobs'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const id = getRouterParam(event, 'id')
    if (!id || !cancelJob(id)) throw new Error('PDF_JOB_NOT_FOUND')
    return { success: true, data: { id } }
  })
})
