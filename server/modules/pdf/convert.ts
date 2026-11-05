import { statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import type { PdfFileInfo } from '#shared/types/pdf'
import { dataBufferToPdf } from './data/to-pdf'
import { readInput } from './inputs'
import { docxToPdf } from './office/docxToPdf'
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
 * Turns any stored input into a PDF in `merged/`, so the result joins the same
 * download / preview / open-folder flow as every other output.
 */
export async function inputToPdf(rawName: string): Promise<PdfFileInfo> {
  const name = safeFileName(rawName)
  const { buffer, kind } = readInput(rawName)
  const title = safeStem(name)

  let bytes: Buffer
  if (kind === 'image') {
    bytes = await imageToPdf(name, buffer, title)
  } else if (kind === 'docx') {
    bytes = await docxToPdf(buffer, title)
  } else {
    bytes = await dataBufferToPdf(name, buffer)
  }

  const outputName = `${safeStem(name)}.pdf`
  const target = join(outputDir('convertInput'), outputName)
  writeFileSync(target, bytes)

  return {
    name: outputName,
    path: target,
    size: statSync(target).size,
    modifiedAt: statSync(target).mtime.toISOString()
  }
}
