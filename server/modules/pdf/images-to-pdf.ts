import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { ensureDir } from './paths'
import { isImageName, naturalCompare, safeFileName } from './security'

export async function imagesToPdf(
  folderPath: string,
  outputDir: string,
  outputName: string
): Promise<{ output: string, pages: number }> {
  if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
    throw new Error('PDF_FOLDER_NOT_FOUND')
  }

  const files = readdirSync(folderPath)
    .filter(isImageName)
    .sort(naturalCompare)

  if (files.length === 0) {
    throw new Error('PDF_EMPTY_FOLDER')
  }

  const doc = await PDFDocument.create()

  for (const file of files) {
    const bytes = readFileSync(join(folderPath, file))
    const image = extname(file).toLowerCase() === '.png'
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes)

    const page = doc.addPage([image.width, image.height])
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  }

  ensureDir(outputDir)
  const output = join(outputDir, safeFileName(outputName))
  writeFileSync(output, await doc.save())

  return { output, pages: doc.getPageCount() }
}
