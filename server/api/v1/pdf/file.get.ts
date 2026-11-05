import { createReadStream } from 'node:fs'
import { MIME_BY_EXTENSION, parseArea, resolveAreaFile } from '#server/modules/pdf/inspect'
import { runPdf } from '#server/utils/pdfApi'

/**
 * One endpoint for every library file, used by the preview components and the
 * download buttons. `?inline=1` streams the bytes for in-app rendering instead
 * of forcing a save dialog.
 */
export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const query = getQuery(event)
    const area = parseArea(query.area)
    const name = typeof query.name === 'string' ? query.name : ''
    if (!name) throw new Error('PDF_FILE_NOT_FOUND')

    const file = resolveAreaFile(area, name)
    const inline = query.inline === '1' || query.inline === 'true'

    setHeader(event, 'content-type', MIME_BY_EXTENSION[file.extension] ?? 'application/octet-stream')
    setHeader(event, 'content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`)
    setHeader(event, 'cache-control', 'no-store')

    return sendStream(event, createReadStream(file.path))
  })
})
