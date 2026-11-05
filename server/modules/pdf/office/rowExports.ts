import ExcelJS from 'exceljs'
import {
  AlignmentType,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import { PDF_EXPORT_COLUMNS, type PdfExportRow } from '#shared/types/pdf'

/**
 * The catalogue is 25 columns wide, so a spreadsheet is the natural target:
 * frozen header, filter buttons and readable widths instead of one long line.
 */
export async function rowsToXlsx(rows: PdfExportRow[], sheetName = 'products'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'tm-tools PDF Studio'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 1 }]
  })

  sheet.columns = PDF_EXPORT_COLUMNS.map(column => ({
    header: column,
    key: column,
    width: Math.min(48, Math.max(12, column.length + 4, ...rows.slice(0, 50).map(row => String(row[column] ?? '').length + 2)))
  }))

  for (const row of rows) {
    sheet.addRow(PDF_EXPORT_COLUMNS.map(column => row[column] ?? ''))
  }

  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: 'middle' }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: PDF_EXPORT_COLUMNS.length }
  }

  // Prices and stock are numeric in the target system; keep them as numbers so
  // Excel does not flag every cell.
  const numeric = new Set(['no', 'basePrice', 'salePrice', 'stock', 'manageStock', 'v_basePrice', 'v_salePrice', 'v_stock'])
  numeric.forEach((column) => {
    const index = PDF_EXPORT_COLUMNS.indexOf(column as never) + 1
    if (index <= 0) return
    sheet.getColumn(index).numFmt = '0'
  })

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

/**
 * Word export is for a human to read or print, so it uses landscape A4 and a
 * compact table rather than one paragraph per row.
 */
export async function rowsToDocx(rows: PdfExportRow[], title = 'Danh mục sản phẩm'): Promise<Buffer> {
  const header = new TableRow({
    tableHeader: true,
    children: PDF_EXPORT_COLUMNS.map(column => new TableCell({
      width: { size: 100 / PDF_EXPORT_COLUMNS.length, type: WidthType.PERCENTAGE },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: column, bold: true, size: 12 })]
      })]
    }))
  })

  const body = rows.map(row => new TableRow({
    children: PDF_EXPORT_COLUMNS.map(column => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: String(row[column] ?? ''), size: 12 })],
        spacing: { after: 0 }
      })]
    }))
  }))

  const doc = new Document({
    title,
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 480, right: 360, bottom: 480, left: 360 }
        }
      },
      children: [
        new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 24 })] }),
        new Paragraph({ text: '' }),
        new Table({ rows: [header, ...body], width: { size: 100, type: WidthType.PERCENTAGE } })
      ]
    }]
  })

  return Packer.toBuffer(doc)
}
