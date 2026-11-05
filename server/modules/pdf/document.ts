import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { config } from '#server/config'
import { ensureDir } from './paths'

export async function loadPdf(path: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(readFileSync(path))
  } catch {
    throw new Error('PDF_INVALID')
  }
}

export async function countPages(path: string): Promise<number> {
  const doc = await loadPdf(path)
  return doc.getPageCount()
}

export function pageFileName(pageNumber: number): string {
  return `${config.pdf.pagePrefix}${String(pageNumber).padStart(config.pdf.padLength, '0')}`
}

export async function splitPdf(inputPath: string, outputDir: string): Promise<{ totalPages: number, dir: string }> {
  const doc = await loadPdf(inputPath)
  const totalPages = doc.getPageCount()

  if (totalPages > config.pdf.maxPages) {
    throw new Error('PDF_TOO_MANY_PAGES')
  }

  ensureDir(outputDir)

  for (let index = 0; index < totalPages; index++) {
    const single = await PDFDocument.create()
    const [page] = await single.copyPages(doc, [index])
    single.addPage(page)
    writeFileSync(join(outputDir, `${pageFileName(index + 1)}.pdf`), await single.save())
  }

  return { totalPages, dir: outputDir }
}
