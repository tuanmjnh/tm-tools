import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

interface TextItem {
  str: string
  x: number
  y: number
  width: number
}

interface Line {
  y: number
  text: string
}

/** Tokens closer than this on the same baseline belong to the same line. */
const LINE_TOLERANCE = 3
/** A horizontal gap this large is treated as a column separator. */
const COLUMN_GAP = 12

function groupLines(items: TextItem[]): Line[] {
  const lines: { y: number, items: TextItem[] }[] = []

  for (const item of items) {
    const existing = lines.find(line => Math.abs(line.y - item.y) <= LINE_TOLERANCE)
    if (existing) existing.items.push(item)
    else lines.push({ y: item.y, items: [item] })
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      const sorted = [...line.items].sort((a, b) => a.x - b.x)
      let text = ''
      let end: number | null = null

      for (const item of sorted) {
        if (end !== null && item.x - end > COLUMN_GAP) text += '\t'
        else if (text && !text.endsWith('\t')) text += ' '
        text += item.str
        end = item.x + (item.width || 0)
      }

      return { y: line.y, text: text.replace(/\s+$/, '') }
    })
    .filter(line => line.text.trim().length > 0)
}

/**
 * PDF→Word keeps text and line order only: fonts, colours, images and merged
 * cells are lost. Rows separated by wide gaps become tab stops, which Word
 * users can convert into a table.
 */
export async function pdfToDocx(buffer: Buffer, title?: string): Promise<Buffer> {
  type PdfJsDocument = {
    numPages: number
    getPage: (pageNumber: number) => Promise<{ getTextContent: () => Promise<unknown> }>
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as {
    getDocument: (options: Record<string, unknown>) => { promise: Promise<PdfJsDocument> }
  }

  const pdf = await pdfjs.getDocument({
    // pdfjs owns the buffer, so hand it a copy instead of a view we might share.
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false
  }).promise

  const children: Paragraph[] = []

  if (title) {
    children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }))
  }

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent() as { items: { str?: string, transform?: number[], width?: number }[] }

    const items: TextItem[] = content.items
      .filter(item => typeof item.str === 'string' && item.str.trim().length > 0)
      .map((item) => {
        const transform = item.transform ?? [1, 0, 0, 1, 0, 0]
        return {
          str: item.str as string,
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          width: item.width ?? 0
        }
      })

    if (pageNumber > 1) children.push(new Paragraph({ text: '' }))
    children.push(new Paragraph({
      text: `Trang ${pageNumber}`,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 }
    }))

    for (const line of groupLines(items)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line.text, size: 20 })],
        spacing: { after: 40 }
      }))
    }
  }

  const doc = new Document({
    title,
    sections: [{ properties: {}, children }]
  })

  return Packer.toBuffer(doc)
}
