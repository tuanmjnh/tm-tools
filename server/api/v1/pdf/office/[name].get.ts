import { createReadStream, statSync } from 'node:fs'
import { officePath } from '#server/modules/pdf/library'
import { runPdf, pathParam } from '#server/utils/pdfApi'

const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_OFFICE_NOT_FOUND')

    const path = officePath(name)
    const { size } = statSync(path)
    const extension = name.split('.').pop()?.toLowerCase() ?? ''
    const disposition = getQuery(event).download ? 'attachment' : 'inline'

    setHeader(event, 'content-type', MIME[extension] ?? 'application/octet-stream')
    setHeader(event, 'content-length', size)
    setHeader(event, 'content-disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`)

    return sendStream(event, createReadStream(path))
  })
})
