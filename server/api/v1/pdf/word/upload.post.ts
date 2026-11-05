import type { H3Event } from 'h3'
import { saveWord } from '#server/modules/pdf/library'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event: H3Event) => {
  return runPdf(async () => {
    const parts = await readMultipartFormData(event)
    if (!parts?.length) {
      throw new Error('PDF_EMPTY_UPLOAD')
    }

    const saved = []

    for (const part of parts) {
      if (part.name !== 'files' || !part.filename || !part.data?.length) continue
      saved.push(saveWord(part.filename, part.data))
    }

    if (saved.length === 0) {
      throw new Error('PDF_EMPTY_UPLOAD')
    }

    return { success: true, data: saved }
  })
})
