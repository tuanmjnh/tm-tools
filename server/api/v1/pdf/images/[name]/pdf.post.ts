import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { imagesToPdf } from '#server/modules/pdf/images-to-pdf'
import { areaDir, outputDir } from '#server/modules/pdf/workspace'
import { safeFileName } from '#server/modules/pdf/security'
import { runPdf, pathParam, overwriteFlag } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_FOLDER_NOT_FOUND')

    const body = await readBody<{ overwrite?: unknown }>(event) || {}
    const folder = safeFileName(name)
    const outputName = `${folder}_from_images.pdf`
    if (!overwriteFlag(body.overwrite) && existsSync(join(outputDir('imagesToPdf'), outputName))) {
      throw new Error('PDF_FILE_ALREADY_EXISTS')
    }

    const result = await imagesToPdf(
      join(areaDir('images'), folder),
      outputDir('imagesToPdf'),
      outputName
    )

    return { success: true, data: { file: outputName, pages: result.pages } }
  })
})
