import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { mergePdfFolder } from '#server/modules/pdf/merge'
import { areaDir, outputDir } from '#server/modules/pdf/workspace'
import { safeFileName } from '#server/modules/pdf/security'
import { runPdf, pathParam, overwriteFlag } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_FOLDER_NOT_FOUND')

    const body = await readBody<{ overwrite?: unknown }>(event) || {}
    const folder = safeFileName(name)
    const outputName = `${folder}_merged.pdf`
    if (!overwriteFlag(body.overwrite) && existsSync(join(outputDir('merge'), outputName))) {
      throw new Error('PDF_FILE_ALREADY_EXISTS')
    }

    const result = await mergePdfFolder(
      join(areaDir('split'), folder),
      outputDir('merge'),
      outputName
    )

    return { success: true, data: { file: outputName, pages: result.pages } }
  })
})
