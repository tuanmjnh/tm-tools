import { PDFDocument } from 'pdf-lib'
import { docxToBlocks, type DocxBlock } from './docxParse'
import { embedBodyFont } from './font'
import { drawParagraph, drawTable, newCursor, HEADING_SIZE, type Cursor } from './layout'

/**
 * Word→PDF without LibreOffice: blocks are laid out directly with pdf-lib.
 * Fidelity is intentionally conservative (single font, no images, no columns),
 * which is enough for price lists and keeps the feature dependency-free.
 */
export async function docxToPdf(buffer: Buffer, title?: string): Promise<Buffer> {
  const blocks: DocxBlock[] = await docxToBlocks(buffer)

  const doc = await PDFDocument.create()
  const font = await embedBodyFont(doc)
  if (title) doc.setTitle(title)
  doc.setProducer('tm-tools PDF Studio')

  const cursor: Cursor = newCursor(doc)

  for (const block of blocks) {
    if (block.type === 'heading') {
      cursor.y -= 6
      drawParagraph(doc, cursor, font, block.text, HEADING_SIZE[block.level] ?? 12)
      cursor.y -= 4
    } else if (block.type === 'paragraph') {
      drawParagraph(doc, cursor, font, block.text, 10.5)
      cursor.y -= 4
    } else if (block.type === 'list') {
      block.items.forEach((item, index) => {
        const marker = block.ordered ? `${index + 1}.` : '•'
        drawParagraph(doc, cursor, font, `${marker} ${item}`, 10.5, { indent: 12 })
      })
      cursor.y -= 4
    } else {
      cursor.y -= 2
      drawTable(doc, cursor, font, block.rows, 9)
      cursor.y -= 8
    }
  }

  return Buffer.from(await doc.save())
}
