import { createReadStream, statSync } from 'node:fs'
import { sourcePath } from '#server/modules/pdf/library'
import { runPdf, pathParam } from '#server/utils/pdfApi'

/** Inline by default (browser preview); `?download=1` forces a download. */
export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const decoded = pathParam(getRouterParam(event, 'name'))
    if (!decoded) throw new Error('PDF_SOURCE_NOT_FOUND')
    const path = sourcePath(decoded)
    const { size } = statSync(path)
    const disposition = getQuery(event).download ? 'attachment' : 'inline'

    setHeader(event, 'content-type', 'application/pdf')
    setHeader(event, 'content-length', size)
    setHeader(event, 'content-disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(decoded)}`)

    return sendStream(event, createReadStream(path))
  })
})
