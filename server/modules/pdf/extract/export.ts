import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { PDF_EXPORT_COLUMNS, type PdfExportRow } from '#shared/types/pdf'
import { rowsToXml } from '../data/parse'
import { rowsToDocx, rowsToXlsx } from '../office/rowExports'
import { ensureDir, writeFileAtomic } from '../paths'

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
export async function writeProducts<T extends readonly string[] = readonly ['csv', 'json', 'xlsx', 'docx', 'xml']>(
  dir: string,
  stem: string,
  rows: PdfExportRow[],
  formats?: T
): Promise<Record<string, string>> {
  ensureDir(dir)
  const allowed = formats && formats.length > 0 ? new Set(formats) : new Set(['csv', 'json', 'xlsx', 'docx', 'xml'])
  const result: Record<string, string> = {}

  if (allowed.has('csv')) {
    const csv = join(dir, `${stem}.csv`)
    writeFileAtomic(csv, toCsv(rows), 'utf8')
    result.csv = csv
  }
  if (allowed.has('json')) {
    const json = join(dir, `${stem}.json`)
    writeFileAtomic(json, JSON.stringify(rows, null, 2), 'utf8')
    result.json = json
  }
  if (allowed.has('xml')) {
    const xml = join(dir, `${stem}.xml`)
    writeFileAtomic(xml, rowsToXml(rows), 'utf8')
    result.xml = xml
  }
  if (allowed.has('xlsx')) {
    const xlsx = join(dir, `${stem}.xlsx`)
    writeFileAtomic(xlsx, await rowsToXlsx(rows, stem.slice(0, 31)))
    result.xlsx = xlsx
  }
  if (allowed.has('docx')) {
    const docx = join(dir, `${stem}.docx`)
    writeFileAtomic(docx, await rowsToDocx(rows, stem))
    result.docx = docx
  }

  return result
}

/** True when a previous run already wrote the downloadable table for this stem. */
export function hasProductFiles(dir: string, stem: string, formats?: readonly string[]): boolean {
  const checkFormats = formats && formats.length > 0 ? formats : ['csv', 'json', 'xlsx', 'docx', 'xml']
  return checkFormats.some(ext => existsSync(join(dir, `${stem}.${ext}`)))
}
