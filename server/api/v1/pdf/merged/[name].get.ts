import { createReadStream } from 'node:fs'
import { outputPath } from '#server/modules/pdf/library'
import { runPdf, pathParam } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_OUTPUT_NOT_FOUND')

    const path = outputPath(name)
    setHeader(event, 'content-type', 'application/pdf')
    setHeader(event, 'content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)

    return sendStream(event, createReadStream(path))
  })
})
