import { PDFDocument } from 'pdf-lib'
import { embedBodyFont } from '../office/font'
import { drawParagraph, drawTable, newCursor, HEADING_SIZE } from '../office/layout'
import { parseTabular, type ParsedTable } from './parse'

function finish(doc: PDFDocument, title: string): Promise<Buffer> {
  doc.setTitle(title)
  doc.setProducer('tm-tools PDF Studio')
  doc.setCreator('tm-tools PDF Studio')
  return doc.save().then(bytes => Buffer.from(bytes))
}

/** Plain text (or a data file we could not turn into a grid) → PDF pages. */
export async function textToPdf(title: string, text: string): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await embedBodyFont(doc)
  const cursor = newCursor(doc)

  drawParagraph(doc, cursor, font, title, HEADING_SIZE[2]!, {})
  cursor.y -= 8

  for (const line of text.split(/\r?\n/)) {
    drawParagraph(doc, cursor, font, line || ' ', 9.5)
  }

  return finish(doc, title)
}

/**
 * A parsed table (csv / xlsx / json / xml) → PDF. The first row is treated as
 * the header, the rest as records; long cells wrap instead of overflowing.
 */
export async function tableToPdf(table: ParsedTable): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await embedBodyFont(doc)
  const cursor = newCursor(doc)

  drawParagraph(doc, cursor, font, table.title, HEADING_SIZE[2]!)
  cursor.y -= 10

  const rows = table.rows.filter(row => row.some(value => value !== ''))
  if (!rows.length) {
    drawParagraph(doc, cursor, font, '(empty)', 10)
    return finish(doc, table.title)
  }

  const columns = Math.max(...rows.map(row => row.length))
  const header = rows.length > 1 && rows[0]!.length >= 2 ? rows.slice(0, 1) : []
  const body = header.length ? rows.slice(1) : rows

  drawTable(doc, cursor, font, [...header, ...body], header.length ? 9 : 9.5, {
    headerRows: header.length,
    columns
  })

  return finish(doc, table.title)
}

/** Reads a supported data file and renders it; text-only files fall back to text. */
export async function dataBufferToPdf(name: string, buffer: Buffer): Promise<Buffer> {
  const parsed = await parseTabular(name, buffer)
  if (parsed && parsed.rows.length) return tableToPdf(parsed)

  const text = buffer.toString('utf8')
  if (parsed) return textToPdf(parsed.title, text.slice(0, 200_000))
  return textToPdf(name.replace(/\.[^.]+$/, ''), text.slice(0, 200_000))
}
