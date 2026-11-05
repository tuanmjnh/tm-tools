import { listAreaDirectory } from '#server/modules/pdf/directory'
import { parseArea } from '#server/modules/pdf/inspect'
import { areaAcceptPredicate } from '#server/modules/pdf/workspace'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const query = getQuery(event)
    const area = parseArea(query.area)
    const folder = typeof query.folder === 'string' ? query.folder : ''

    const accept = areaAcceptPredicate(area)

    return {
      success: true,
      data: listAreaDirectory(area, folder, accept)
    }
  })
})
