import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { inputToPdf } from '#server/modules/pdf/convert'
import { outputDir } from '#server/modules/pdf/workspace'
import { safeFileName, safeStem } from '#server/modules/pdf/security'
import { runPdf, pathParam, overwriteFlag } from '#server/utils/pdfApi'

/** image / docx / xlsx / csv / json / xml → PDF (written to the merged folder). */
export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_INPUT_NOT_FOUND')

    const body = await readBody<{ overwrite?: unknown }>(event) || {}
    const outputName = `${safeStem(safeFileName(name))}.pdf`
    if (!overwriteFlag(body.overwrite) && existsSync(join(outputDir('convertInput'), outputName))) {
      throw new Error('PDF_FILE_ALREADY_EXISTS')
    }

    const file = await inputToPdf(name)
    return { success: true, data: file }
  })
})
