import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDF_EXPORT_COLUMNS, type PdfExportRow } from '#shared/types/pdf'
import { rowsToXml } from '../data/parse'
import { rowsToDocx, rowsToXlsx } from '../office/rowExports'
import { ensureDir } from '../paths'

const CSV_SEPARATOR = ','
const CSV_LINE_BREAK = '\r\n'

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(rows: PdfExportRow[]): string {
  const lines = rows.map(row => PDF_EXPORT_COLUMNS
    .map(column => escapeCell(row[column] ?? ''))
    .join(CSV_SEPARATOR))

  return `\uFEFF${[PDF_EXPORT_COLUMNS.join(CSV_SEPARATOR), ...lines].join(CSV_LINE_BREAK)}`
}

/**
 * A finished run writes every supported format: CSV/JSON/XML for machines, XLSX
 * for the catalogue owner, DOCX for people who want to read or print the table.
 */
export async function writeProducts(
  dir: string,
  stem: string,
  rows: PdfExportRow[]
): Promise<{ csv: string, json: string, xlsx: string, docx: string, xml: string }> {
  ensureDir(dir)
  const csv = join(dir, `${stem}.csv`)
  const json = join(dir, `${stem}.json`)
  const xlsx = join(dir, `${stem}.xlsx`)
  const docx = join(dir, `${stem}.docx`)
  const xml = join(dir, `${stem}.xml`)

  writeFileSync(csv, toCsv(rows), 'utf8')
  writeFileSync(json, JSON.stringify(rows, null, 2), 'utf8')
  writeFileSync(xml, rowsToXml(rows), 'utf8')
  writeFileSync(xlsx, await rowsToXlsx(rows, stem.slice(0, 31)))
  writeFileSync(docx, await rowsToDocx(rows, stem))

  return { csv, json, xlsx, docx, xml }
}

/** True when a previous run already wrote the downloadable table for this stem. */
export function hasProductFiles(dir: string, stem: string): boolean {
  return ['csv', 'json', 'xlsx', 'docx', 'xml'].some(ext => existsSync(join(dir, `${stem}.${ext}`)))
}
