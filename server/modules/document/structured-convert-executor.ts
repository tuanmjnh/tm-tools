import ExcelJS from 'exceljs'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DocumentOperationExecutor, OperationExecutionContext, ValidationResult, VerifiedInput } from './contracts'
import { DocumentError } from './operations'
import { writeFileAtomic } from '../pdf/paths'
import { safeFileName } from '../pdf/security'
import { csvToRows, rowsToCsv, xmlToJsonValue, jsonValueToXml } from './structured'

/**
 * `structured.convert` maps between the tabular/structured formats whose edges
 * were declared-then-disabled: csv ↔ xlsx, xml ↔ json. Each conversion first
 * reduces its input to an intermediate (a row grid for the tabular pair, a JSON
 * value for the markup pair), then renders the requested target. Deterministic,
 * no model, runs on every runtime.
 */

export const STRUCTURED_TARGETS = ['csv', 'xlsx', 'xml', 'json'] as const
export type StructuredTarget = typeof STRUCTURED_TARGETS[number]

const TABULAR = new Set(['csv', 'xlsx'])
const MARKUP = new Set(['xml', 'json'])

export interface StructuredConvertConfig {
  target?: string
}

function single(inputs: VerifiedInput[]): VerifiedInput {
  const found = inputs[0]
  if (!found) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')
  return found
}

function extOf(input: VerifiedInput): string {
  return (input.extension || safeFileName(input.safeName).split('.').pop() || '').toLowerCase().replace('.', '')
}

function resolveTarget(raw: string | undefined): StructuredTarget {
  const value = String(raw ?? '').trim().toLowerCase()
  if ((STRUCTURED_TARGETS as readonly string[]).includes(value)) return value as StructuredTarget
  throw new DocumentError('DOCUMENT_OPERATION_CONFIG_INVALID', { field: 'target' })
}

function stemOf(name: string): string {
  return safeFileName(name).replace(/\.[^.]+$/, '') || 'data'
}

async function xlsxToRows(bytes: Uint8Array): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []
  const rows: string[][] = []
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cellText(cell.value))
    })
    rows.push(cells)
  })
  return rows
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if ('text' in value && typeof (value as { text?: unknown }).text === 'string') return (value as { text: string }).text
    if ('result' in value) return String((value as { result?: unknown }).result ?? '')
    if ('richText' in value) return (value as { richText: Array<{ text: string }> }).richText.map(r => r.text).join('')
    if (value instanceof Date) return value.toISOString()
  }
  return String(value)
}

async function rowsToXlsx(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'tm-tools Document Studio'
  const sheet = workbook.addWorksheet('data')
  for (const row of rows) sheet.addRow(row)
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export class StructuredConvertExecutor implements DocumentOperationExecutor<StructuredConvertConfig> {
  readonly operationId = 'structured.convert' as const

  async validateInputs(inputs: VerifiedInput[], config: StructuredConvertConfig = {}): Promise<ValidationResult> {
    if (inputs.length !== 1) return { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
    const ext = extOf(inputs[0]!)
    if (!['csv', 'xlsx', 'xml', 'json'].includes(ext)) {
      return { ok: false, issues: [{ code: 'DOCUMENT_INPUT_TYPE_NOT_SUPPORTED' }] }
    }
    let target: StructuredTarget
    try {
      target = resolveTarget(config.target)
    } catch {
      return { ok: false, issues: [{ code: 'DOCUMENT_OPERATION_CONFIG_INVALID', details: { field: 'target' } }] }
    }
    // Tabular sources only reach tabular/markup targets via a rows intermediate,
    // and a cell grid is not a meaningful XML document — refuse cross-family.
    const sourceFamily = TABULAR.has(ext) ? 'tabular' : MARKUP.has(ext) ? 'markup' : 'other'
    const targetFamily = TABULAR.has(target) ? 'tabular' : 'markup'
    if (sourceFamily !== targetFamily) {
      return { ok: false, issues: [{ code: 'DOCUMENT_OPERATION_CONFIG_INVALID', details: { field: 'target' } }] }
    }
    return { ok: true, issues: [] }
  }

  async execute(context: OperationExecutionContext, config: StructuredConvertConfig = {}) {
    const input = single(context.inputs)
    const target = resolveTarget(config.target)
    const source = extOf(input)
    const stem = stemOf(input.safeName)
    const bytes = readFileSync(input.stagedPath)
    await context.onProgress({ totalUnits: 1, completedUnits: 0 })

    let output: Buffer | string
    let mime: string

    if (TABULAR.has(target)) {
      const rows = source === 'csv' ? csvToRows(bytes.toString('utf8')) : await xlsxToRows(bytes)
      if (target === 'csv') {
        output = rowsToCsv(rows)
        mime = 'text/csv'
      } else {
        output = await rowsToXlsx(rows)
        mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    } else {
      const value = source === 'xml'
        ? xmlToJsonValue(bytes.toString('utf8'))
        : JSON.parse(bytes.toString('utf8')) as unknown
      if (target === 'json') {
        output = JSON.stringify(value, null, 2)
        mime = 'application/json'
      } else {
        output = jsonValueToXml('root', value)
        mime = 'application/xml'
      }
    }

    const fileName = `${stem}.${target}`
    const outPath = join(context.workspace.outputDir, fileName)
    writeFileAtomic(outPath, typeof output === 'string' ? output : new Uint8Array(output))
    await context.onProgress({ totalUnits: 1, completedUnits: 1 })
    return { files: [{ fileName, mimeType: mime, path: outPath, size: statSync(outPath).size }] }
  }
}
