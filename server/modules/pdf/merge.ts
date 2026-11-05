import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { ensureDir } from './paths'
import { isPdfName, naturalCompare, safeFileName } from './security'

export async function mergePdfFolder(
  folderPath: string,
  outputDir: string,
  outputName: string
): Promise<{ output: string, pages: number }> {
  if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
    throw new Error('PDF_FOLDER_NOT_FOUND')
  }

  const files = readdirSync(folderPath)
    .filter(isPdfName)
    .sort(naturalCompare)

  if (files.length === 0) {
    throw new Error('PDF_EMPTY_FOLDER')
  }

  const merged = await PDFDocument.create()

  for (const file of files) {
    const doc = await PDFDocument.load(readFileSync(join(folderPath, file)))
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach(page => merged.addPage(page))
  }

  ensureDir(outputDir)
  const output = join(outputDir, safeFileName(outputName))
  writeFileSync(output, await merged.save())

  return { output, pages: merged.getPageCount() }
}
