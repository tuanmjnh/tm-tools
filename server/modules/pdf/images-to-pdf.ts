import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { PDFDocument } from 'pdf-lib'
import { recordAudit } from './audit'
import { ensureDir, writeFileAtomic } from './paths'
import { isImageName, naturalCompare, safeFileName } from './security'

/** pdf-lib embeds PNG/JPEG only; webp is decoded and re-encoded to PNG first. */
async function webpToPng(bytes: Buffer): Promise<Uint8Array> {
  const image = await loadImage(bytes)
  const canvas = createCanvas(image.width, image.height)
  canvas.getContext('2d').drawImage(image, 0, 0)
  return new Uint8Array(canvas.toBuffer('image/png'))
}

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
    const ext = extname(file).toLowerCase()
    const bytes = readFileSync(join(folderPath, file))
    let image
    if (ext === '.png') {
      image = await doc.embedPng(bytes)
    } else if (ext === '.webp') {
      image = await doc.embedPng(await webpToPng(bytes))
    } else {
      image = await doc.embedJpg(bytes)
    }

    const page = doc.addPage([image.width, image.height])
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  }

  ensureDir(outputDir)
  const output = join(outputDir, safeFileName(outputName))
  writeFileAtomic(output, await doc.save())
  recordAudit({ action: 'output', area: 'merged', target: basename(output), tool: 'images-to-pdf' })

  return { output, pages: doc.getPageCount() }
}
