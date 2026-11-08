import { statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import type { PdfFileInfo } from '#shared/types/pdf'
import { recordAudit } from './audit'
import { dataBufferToPdf } from './data/to-pdf'
import { readInput, inputKindOf } from './inputs'
import { docxToPdf } from './office/docxToPdf'
import { writeFileAtomic } from './paths'
import { safeFileName, safeStem } from './security'
import { outputDir } from './workspace'

async function imageToPdf(name: string, buffer: Buffer, title: string): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const isPng = /\.png$/i.test(name)
  const image = isPng ? await doc.embedPng(buffer) : await doc.embedJpg(buffer)
  const page = doc.addPage([image.width, image.height])
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  doc.setTitle(title)
  doc.setProducer('tm-tools PDF Studio')
  return Buffer.from(await doc.save())
}

/**
 * Buffer-based conversion shared by the legacy area flow and the v4 executor.
 * The caller already resolved and validated the bytes.
 */
export async function inputBufferToPdf(name: string, buffer: Buffer): Promise<Buffer> {
  const safe = safeFileName(name)
  const title = safeStem(safe)
  const kind = inputKindOf(safe)

  if (kind === 'image') return imageToPdf(safe, buffer, title)
  if (kind === 'docx') return docxToPdf(buffer, title)
  return dataBufferToPdf(safe, buffer)
}

/**
 * Turns any stored input into a PDF in `merged/`, so the result joins the same
 * download / preview / open-folder flow as every other output.
 */
export async function inputToPdf(rawName: string): Promise<PdfFileInfo> {
  const name = safeFileName(rawName)
  const { buffer } = readInput(rawName)

  const bytes = await inputBufferToPdf(name, buffer)

  const outputName = `${safeStem(name)}.pdf`
  const target = join(outputDir('convertInput'), outputName)
  writeFileAtomic(target, bytes)
  recordAudit({ action: 'output', area: 'merged', target: basename(target), tool: 'convert' })

  return {
    name: outputName,
    path: target,
    size: statSync(target).size,
    modifiedAt: statSync(target).mtime.toISOString()
  }
}
