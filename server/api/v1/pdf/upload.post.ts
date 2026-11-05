import type { H3Event } from 'h3'
import { saveSource } from '#server/modules/pdf/library'
import { runPdf } from '#server/utils/pdfApi'

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
      saved.push(saveSource(part.filename, part.data, folder))
    }

    if (saved.length === 0) {
      throw new Error('PDF_EMPTY_UPLOAD')
    }

    return { success: true, data: saved }
  })
})
