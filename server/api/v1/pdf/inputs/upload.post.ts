import type { H3Event } from 'h3'
import { saveInput } from '#server/modules/pdf/inputs'
import { runPdf } from '#server/utils/pdfApi'

/** Accepts every non-PDF input the import workspace understands. */
export default defineEventHandler(async (event: H3Event) => {
  return runPdf(async () => {
    const parts = await readMultipartFormData(event)
    if (!parts?.length) {
      throw new Error('PDF_EMPTY_UPLOAD')
    }

    let folder = ''
    for (const part of parts) {
      if (part.name === 'folder' && part.data) {
        folder = part.data.toString('utf8').trim()
      }
    }

    const saved = []

    for (const part of parts) {
      if (part.name !== 'files' || !part.filename || !part.data?.length) continue
      saved.push(saveInput(part.filename, part.data, folder))
    }

    if (saved.length === 0) {
      throw new Error('PDF_INPUT_INVALID')
    }

    return { success: true, data: saved }
  })
})
