import { outputDir } from '#server/modules/pdf/workspace'
import { removeFolder } from '#server/modules/pdf/library'
import { runPdf } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const name = getRouterParam(event, 'name')
    if (!name) throw new Error('PDF_FOLDER_NOT_FOUND')
    removeFolder(outputDir('rasterize'), name)
    return { success: true, data: { name } }
  })
})
