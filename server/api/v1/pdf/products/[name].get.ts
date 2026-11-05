import { createReadStream } from 'node:fs'
import { productsFilePath } from '#server/modules/pdf/extract/jobs'
import { runPdf } from '#server/utils/pdfApi'

const MIME: Record<string, string> = {
  json: 'application/json',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const query = getQuery(event)
    const name = getRouterParam(event, 'name')
    if (!name) throw new Error('PDF_RESULT_NOT_FOUND')

    const file = productsFilePath(name, String(query.format || 'csv'))
    const extension = file.name.split('.').pop()?.toLowerCase() ?? 'csv'

    setHeader(event, 'content-type', MIME[extension] ?? 'application/octet-stream')
    setHeader(event, 'content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`)

    return sendStream(event, createReadStream(file.path))
  })
})
