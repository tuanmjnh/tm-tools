import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PDF_SOURCE_EXPORT_FORMATS,
  type PdfExportFormatResult,
  type PdfSourceExportFormat
} from '#shared/types/pdf'
import { config } from '#server/config'
import { hasProductFiles, writeProducts } from './extract/export'
import { readCachedRows } from './extract/jobs'
import { sourcePath, splitDirName } from './library'
import { pdfToDocx } from './office/pdfToDocx'
import { ensureDir } from './paths'
import { rasterizePdf } from './raster'
import { outputDir } from './workspace'
import { documentStem } from './security'

export function normalizeFormats(raw: unknown): PdfSourceExportFormat[] {
  const requested = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  const valid = new Set<string>(PDF_SOURCE_EXPORT_FORMATS)
  const formats = requested
    .map(value => String(value).trim().toLowerCase())
    .filter(value => valid.has(value)) as PdfSourceExportFormat[]
  return [...new Set(formats)]
}

/**
 * Exports one source PDF to the requested targets. Each format is attempted on
 * its own so a missing extraction does not stop the image/Word exports.
 */
export async function exportSource(
  rawName: string,
  formats: PdfSourceExportFormat[],
  overwrite = true
): Promise<PdfExportFormatResult[]> {
  const name = rawName
  const stem = documentStem(name)
  const pdfPath = sourcePath(name)
  const results: PdfExportFormatResult[] = []

  for (const format of formats) {
    try {
      if (format === 'png') {
        const folder = splitDirName(name)
        if (!overwrite && existsSync(join(outputDir('rasterize'), folder))) {
          results.push({ format, ok: false, error: 'PDF_FOLDER_ALREADY_EXISTS' })
          continue
        }
        await rasterizePdf(pdfPath, join(outputDir('rasterize'), folder), config.pdf.imageScale)
        results.push({ format, ok: true, name: folder })
        continue
      }

      if (format === 'docx') {
        if (!overwrite && existsSync(join(outputDir('export'), `${stem}.docx`))) {
          results.push({ format, ok: false, error: 'PDF_FILE_ALREADY_EXISTS' })
          continue
        }
        const buffer = await pdfToDocx(readFileSync(pdfPath), stem)
        ensureDir(outputDir('export'))
        const target = join(outputDir('export'), `${stem}.docx`)
        writeFileSync(target, buffer)
        results.push({ format, ok: true, name: `${stem}.docx` })
        continue
      }

      // xlsx / csv / json / xml come from the rows a previous AI run cached.
      const rows = readCachedRows(name)
      if (!rows.length) {
        results.push({ format, ok: false, error: 'PDF_NO_ROWS' })
        continue
      }

      if (!overwrite && hasProductFiles(outputDir('extract'), `${stem}_products`)) {
        results.push({ format, ok: false, error: 'PDF_FILE_ALREADY_EXISTS' })
        continue
      }

      const files = await writeProducts(outputDir('extract'), `${stem}_products`, rows)
      const written = files[format as 'csv' | 'json' | 'xlsx' | 'docx' | 'xml']
      results.push({
        format,
        ok: statSync(written).size > 0,
        name: written.split(/[\\/]/).pop()
      })
    } catch (error) {
      results.push({ format, ok: false, error: (error as Error)?.message || 'PDF_EXPORT_FAILED' })
    }
  }

  return results
}
