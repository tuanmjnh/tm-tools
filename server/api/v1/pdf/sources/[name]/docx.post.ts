import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { recordAudit } from '#server/modules/pdf/audit'
import { sourcePath } from '#server/modules/pdf/library'
import { pdfToDocx } from '#server/modules/pdf/office/pdfToDocx'
import { ensureDir, writeFileAtomic } from '#server/modules/pdf/paths'
import { documentStem } from '#server/modules/pdf/security'
import { outputDir } from '#server/modules/pdf/workspace'
import { runPdf, pathParam, overwriteFlag } from '#server/utils/pdfApi'

/** PDF→Word writes to the office folder; the PDF itself is never modified. */
export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const decoded = pathParam(getRouterParam(event, 'name'))
    if (!decoded) throw new Error('PDF_SOURCE_NOT_FOUND')

    const body = await readBody<{ overwrite?: unknown }>(event) || {}
    const file = `${documentStem(decoded)}.docx`
    if (!overwriteFlag(body.overwrite) && existsSync(join(outputDir('export'), file))) {
      throw new Error('PDF_FILE_ALREADY_EXISTS')
    }

    const pdf = readFileSync(sourcePath(decoded))
    const stem = documentStem(decoded)

    const buffer = await pdfToDocx(pdf, stem)
    ensureDir(outputDir('export'))
    const target = join(outputDir('export'), file)
    writeFileAtomic(target, buffer)
    recordAudit({ action: 'output', area: 'office', target: file, tool: 'pdf-to-docx' })

    return {
      success: true,
      data: { file, size: statSync(target).size }
    }
  })
})
