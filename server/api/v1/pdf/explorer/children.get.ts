import { getAreaFolderChildren } from '#server/modules/pdf/directory'
import { parseArea } from '#server/modules/pdf/inspect'
import { runPdf } from '#server/utils/pdfApi'

/** Subfolders of one folder, used when a lazy explorer node is expanded. */
export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const query = getQuery(event)
    const area = parseArea(query.area)
    const folder = typeof query.folder === 'string' ? query.folder : ''
    return { success: true, data: getAreaFolderChildren(area, folder, 1) }
  })
})
