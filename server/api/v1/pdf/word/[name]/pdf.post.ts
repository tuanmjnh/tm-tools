import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { saveSource, wordPath } from '#server/modules/pdf/library'
import { docxToPdf } from '#server/modules/pdf/office/docxToPdf'
import { areaDir } from '#server/modules/pdf/workspace'
import { documentStem } from '#server/modules/pdf/security'
import { runPdf, overwriteFlag, pathParam } from '#server/utils/pdfApi'

/**
 * Word→PDF keeps the same stem so the converted file lines up with its source
 * in the library and with extraction checkpoints.
 */
export default defineEventHandler(async (event) => {
  return runPdf(async () => {
    const name = pathParam(getRouterParam(event, 'name'))
    if (!name) throw new Error('PDF_WORD_NOT_FOUND')

    const body = await readBody<{ overwrite?: unknown }>(event) || {}
    const path = wordPath(name)
    const stem = documentStem(name)
    const outputName = `${stem}.pdf`
    if (!overwriteFlag(body.overwrite) && existsSync(join(areaDir('input'), outputName))) {
      throw new Error('PDF_FILE_ALREADY_EXISTS')
    }

    const pdf = await docxToPdf(readFileSync(path), stem)
    const pageCount = (await PDFDocument.load(pdf)).getPageCount()
    const saved = saveSource(outputName, pdf)

    return { success: true, data: { file: saved.name, pages: pageCount } }
  })
})
