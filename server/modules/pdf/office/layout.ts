import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib'

export const PAGE_WIDTH = 595.28
export const PAGE_HEIGHT = 841.89
export const MARGIN = 52
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
export const LINE_GAP = 1.35
export const CELL_PADDING = 4

export const HEADING_SIZE: Record<number, number> = { 1: 18, 2: 15.5, 3: 13.5, 4: 12, 5: 11, 6: 10.5 }

export interface Cursor {
  page: PDFPage
  y: number
}

export function newCursor(doc: PDFDocument): Cursor {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  return { page, y: PAGE_HEIGHT - MARGIN }
}

/** Splits on spaces, then hard-breaks a single oversized word. */
export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  const paragraph = text.replace(/\s+/g, ' ').trim()
  if (!paragraph) return lines

  let current = ''
  for (const word of paragraph.split(' ')) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)

    // A single word wider than the column (URL, long SKU) must still fit.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = ''
      for (const char of word) {
        if (font.widthOfTextAtSize(chunk + char, size) > maxWidth && chunk) {
          lines.push(chunk)
          chunk = char
        } else {
          chunk += char
        }
      }
      current = chunk
    } else {
      current = word
    }
  }

  if (current) lines.push(current)
  return lines
}

export function drawTable(
  doc: PDFDocument,
  cursor: Cursor,
  font: PDFFont,
  rows: string[][],
  size: number,
  options: { headerRows?: number, columns?: number } = {}
): void {
  const columns = options.columns ?? Math.max(0, ...rows.map(row => row.length))
  if (columns === 0) return

  // Natural width per column, then scaled down when the row is wider than the page.
  const natural = new Array<number>(columns).fill(0)
  for (const row of rows) {
    for (let index = 0; index < columns; index++) {
      const text = row[index] ?? ''
      natural[index] = Math.max(natural[index]!, font.widthOfTextAtSize(text, size) + CELL_PADDING * 2)
    }
  }
  const total = natural.reduce((sum, width) => sum + width, 0)
  const scale = total > CONTENT_WIDTH ? CONTENT_WIDTH / total : 1
  const widths = natural.map(width => Math.max(28, width * scale))
  const headerRows = options.headerRows ?? 0

  const lineHeight = size * LINE_GAP

  for (const [rowIndex, row] of rows.entries()) {
    const cells = Array.from({ length: columns }, (_, index) => wrap(row[index] ?? '', font, size, widths[index]! - CELL_PADDING * 2))
    const lines = Math.max(1, ...cells.map(cell => cell.length))
    const rowHeight = lines * lineHeight + CELL_PADDING * 2

    if (cursor.y - rowHeight < MARGIN) {
      cursor.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      cursor.y = PAGE_HEIGHT - MARGIN
    }

    const top = cursor.y
    const isHeader = rowIndex < headerRows
    if (isHeader) {
      cursor.page.drawRectangle({
        x: MARGIN,
        y: top - rowHeight,
        width: widths.reduce((sum, width) => sum + width, 0),
        height: rowHeight,
        color: rgb(0.94, 0.95, 0.97)
      })
    }

    let x = MARGIN
    for (let index = 0; index < columns; index++) {
      const cellLines = cells[index]!
      cellLines.forEach((line, lineIndex) => {
        cursor.page.drawText(line, {
          x: x + CELL_PADDING,
          y: top - CELL_PADDING - size - lineIndex * lineHeight,
          size,
          font,
          color: rgb(0.1, 0.1, 0.1)
        })
      })

      // Vertical rule between columns.
      cursor.page.drawLine({
        start: { x, y: top },
        end: { x, y: top - rowHeight },
        thickness: 0.4,
        color: rgb(0.75, 0.75, 0.75)
      })
      x += widths[index]!
    }

    cursor.page.drawLine({
      start: { x: MARGIN, y: top - rowHeight },
      end: { x: MARGIN + widths.reduce((sum, width) => sum + width, 0), y: top - rowHeight },
      thickness: 0.4,
      color: rgb(0.75, 0.75, 0.75)
    })

    cursor.y = top - rowHeight
  }
}

export function drawParagraph(
  doc: PDFDocument,
  cursor: Cursor,
  font: PDFFont,
  text: string,
  size: number,
  options: { indent?: number } = {}
): void {
  const indent = options.indent ?? 0
  const lineHeight = size * LINE_GAP

  for (const line of wrap(text, font, size, CONTENT_WIDTH - indent)) {
    if (cursor.y - lineHeight < MARGIN) {
      cursor.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      cursor.y = PAGE_HEIGHT - MARGIN
    }
    cursor.page.drawText(line, {
      x: MARGIN + indent,
      y: cursor.y - size,
      size,
      font,
      color: rgb(0.1, 0.1, 0.1)
    })
    cursor.y -= lineHeight
  }
}
