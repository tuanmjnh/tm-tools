import { createReadStream, statSync } from 'node:fs'
import { wordPath } from '#server/modules/pdf/library'
import { runPdf, pathParam } from '#server/utils/pdfApi'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** `?download=1` forces the attachment disposition; the default is inline. */
export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_WORD_NOT_FOUND')

    const path = wordPath(name)
    const { size } = statSync(path)
    const disposition = getQuery(event).download ? 'attachment' : 'inline'

    setHeader(event, 'content-type', DOCX_MIME)
    setHeader(event, 'content-length', size)
    setHeader(event, 'content-disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`)

    return sendStream(event, createReadStream(path))
  })
})
