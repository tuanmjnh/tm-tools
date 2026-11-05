import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { splitPdf } from '#server/modules/pdf/document'
import { sourcePath, splitDirName } from '#server/modules/pdf/library'
import { outputDir } from '#server/modules/pdf/workspace'
import { runPdf, pathParam, overwriteFlag } from '#server/utils/pdfApi'

export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_SOURCE_NOT_FOUND')

    const body = await readBody<{ overwrite?: unknown }>(event) || {}
    const source = sourcePath(name)
    const stem = splitDirName(name)
    const targetDir = join(outputDir('split'), stem)
    if (!overwriteFlag(body.overwrite) && existsSync(targetDir)) {
      throw new Error('PDF_FOLDER_ALREADY_EXISTS')
    }

    const result = await splitPdf(source, targetDir)

    return { success: true, data: { folder: stem, ...result } }
  })
})
