import ExcelJS from 'exceljs'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import type { DocumentOperationExecutor, OperationExecutionContext, ValidationResult, VerifiedInput } from './contracts'
import { DocumentError } from './operations'
import { writeFileAtomic } from '../pdf/paths'
import { safeFileName } from '../pdf/security'
import { docxBlocksToText, docxToBlocks, type DocxBlock } from '../pdf/office/docxParse'
import { csvToRows, jsonValueToXml, rowsToCsv, xmlToJsonValue } from './structured'
import { resolveExtractTarget } from '../pdf/extract/models'
import { chatWithConnection } from '#server/utils/aiGateway'

export const OFFICE_SOURCE_EXTS = ['doc', 'docx', 'xlsx', 'xls', 'csv', 'md', 'json', 'xml'] as const
export const OFFICE_TARGET_EXTS = ['xlsx', 'docx', 'csv', 'md', 'json', 'xml'] as const
export type OfficeConvertTarget = typeof OFFICE_TARGET_EXTS[number]

export interface OfficeConvertConfig {
  /** 'auto' picks xlsx for doc/docx/md/json/xml and docx for xls/xlsx/csv. */
  target?: 'auto' | OfficeConvertTarget | string
  useAi?: boolean
  model?: string
  connectionId?: string
  aiPrompt?: string
}

export interface SheetGrid {
  name: string
  rows: string[][]
}

export interface AiDocxPlan {
  title?: string
  sections: Array<{
    heading?: string
    paragraphs?: string[]
    table?: { headers: string[], rows: string[][] }
  }>
}

const MIME_BY_TARGET: Record<OfficeConvertTarget, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  md: 'text/markdown',
  json: 'application/json',
  xml: 'application/xml'
}

function single(inputs: VerifiedInput[]): VerifiedInput {
  const found = inputs[0]
  if (!found) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')
  return found
}

function extOf(input: VerifiedInput): string {
  return (input.extension || safeFileName(input.safeName).split('.').pop() || '').toLowerCase().replace('.', '')
}

function stemOf(name: string): string {
  return safeFileName(name).replace(/\.[^.]+$/, '') || 'document'
}

export function resolveOfficeTarget(sourceExt: string, rawTarget?: string): OfficeConvertTarget {
  if (!(OFFICE_SOURCE_EXTS as readonly string[]).includes(sourceExt)) {
    throw new DocumentError('DOCUMENT_INPUT_TYPE_NOT_SUPPORTED')
  }
  const target = String(rawTarget ?? 'auto').trim().toLowerCase()
  if (target === 'auto') {
    return (sourceExt === 'xlsx' || sourceExt === 'xls' || sourceExt === 'csv') ? 'docx' : 'xlsx'
  }
  if ((OFFICE_TARGET_EXTS as readonly string[]).includes(target)) {
    return target as OfficeConvertTarget
  }
  throw new DocumentError('DOCUMENT_OPERATION_CONFIG_INVALID', { field: 'target' })
}

function tryLibreOfficeConvert(buffer: Buffer, sourceExt: string, targetExt: 'docx' | 'xlsx'): Buffer | null {
  const dir = mkdtempSync(join(tmpdir(), 'tm-office-'))
  try {
    const srcPath = join(dir, `input.${sourceExt}`)
    const outPath = join(dir, `input.${targetExt}`)
    writeFileSync(srcPath, buffer)
    for (const bin of ['soffice', 'libreoffice']) {
      try {
        execFileSync(bin, ['--headless', '--convert-to', targetExt, '--outdir', dir, srcPath], {
          timeout: 25_000,
          stdio: 'ignore'
        })
        if (existsSync(outPath)) return readFileSync(outPath)
      } catch {
        // try next binary
      }
    }
    return null
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function extractLegacyDocBlocks(buffer: Buffer): DocxBlock[] {
  const utf16Runs = buffer.toString('utf16le').match(/[\p{L}\p{N}\p{P}\p{Zs}\t]{6,}/gu) ?? []
  const cleaned = utf16Runs
    .map(run => run.replace(/\s+/g, ' ').trim())
    .filter(run => run.length >= 4 && !/^\p{C}+$/u.test(run))

  const deduped: string[] = []
  for (const line of cleaned) {
    if (deduped[deduped.length - 1] !== line) deduped.push(line)
  }

  return deduped.map(text => ({ type: 'paragraph', text }))
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if ('text' in value && typeof (value as { text?: unknown }).text === 'string') return (value as { text: string }).text
    if ('result' in value) return String((value as { result?: unknown }).result ?? '')
    if ('richText' in value) return (value as { richText: Array<{ text: string }> }).richText.map(r => r.text).join('')
    if (value instanceof Date) return value.toISOString().slice(0, 10)
  }
  return String(value)
}

export async function readWorkbookSheets(bytes: Uint8Array): Promise<SheetGrid[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  const sheets: SheetGrid[] = []

  for (const sheet of workbook.worksheets) {
    const rows: string[][] = []
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      const count = row.cellCount
      for (let col = 1; col <= count; col++) {
        cells.push(cellText(row.getCell(col).value))
      }
      if (cells.some(c => c.trim().length > 0)) rows.push(cells)
    })
    if (rows.length) sheets.push({ name: sheet.name, rows })
  }

  return sheets
}

function styleWorksheet(sheet: ExcelJS.Worksheet, rows: string[][]): void {
  for (const row of rows) sheet.addRow(row)
  if (!rows.length) return

  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' }
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  const colCount = Math.max(...rows.map(r => r.length), 1)
  for (let col = 1; col <= colCount; col++) {
    let maxLen = 10
    for (const row of rows) {
      const val = String(row[col - 1] ?? '')
      if (val.length > maxLen) maxLen = val.length
    }
    sheet.getColumn(col).width = Math.min(50, maxLen + 3)
  }
}

export function blocksToSheets(blocks: DocxBlock[]): SheetGrid[] {
  const tables = blocks.filter((b): b is Extract<DocxBlock, { type: 'table' }> => b.type === 'table')
  if (tables.length) {
    return tables.map((table, idx) => ({
      name: `Table ${idx + 1}`.slice(0, 31),
      rows: table.rows
    }))
  }

  const rows: string[][] = [['Section', 'Type', 'Content']]
  let currentSection = ''
  for (const block of blocks) {
    if (block.type === 'heading') {
      currentSection = block.text
      rows.push([currentSection, `H${block.level}`, block.text])
    } else if (block.type === 'paragraph') {
      rows.push([currentSection, 'Paragraph', block.text])
    } else if (block.type === 'list') {
      for (const item of block.items) {
        rows.push([currentSection, block.ordered ? 'Ordered list' : 'List', item])
      }
    }
  }
  return [{ name: 'Document', rows }]
}

export async function sheetsToXlsxBuffer(sheets: SheetGrid[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'tm-tools Document Studio'
  for (const s of sheets) {
    const sheet = workbook.addWorksheet(s.name.slice(0, 31) || 'Sheet')
    styleWorksheet(sheet, s.rows)
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function wordBlocksToXlsxBuffer(blocks: DocxBlock[]): Promise<Buffer> {
  return sheetsToXlsxBuffer(blocksToSheets(blocks))
}

function makeDocxTable(headers: string[], rows: string[][]): Table {
  const allRows = headers.length ? [headers, ...rows] : rows
  const colCount = Math.max(...allRows.map(r => r.length), 1)
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }

  const tableRows = allRows.map((row, rowIdx) => new TableRow({
    tableHeader: rowIdx === 0 && headers.length > 0,
    children: Array.from({ length: colCount }, (_, colIdx) => {
      const text = String(row[colIdx] ?? '')
      const isHeader = rowIdx === 0 && headers.length > 0
      return new TableCell({
        shading: isHeader ? { type: ShadingType.CLEAR, fill: 'F1F5F9' } : undefined,
        borders: { top: border, bottom: border, left: border, right: border },
        children: [
          new Paragraph({
            children: [new TextRun({ text, bold: isHeader, size: 20 })]
          })
        ]
      })
    })
  }))

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows
  })
}

export async function sheetsToDocxBuffer(sheets: SheetGrid[], title?: string): Promise<Buffer> {
  const children: Array<Paragraph | Table> = []
  if (title) {
    children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }))
  }

  for (const sheet of sheets) {
    children.push(new Paragraph({
      text: sheet.name,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 }
    }))
    if (sheet.rows.length) {
      const [header, ...body] = sheet.rows
      children.push(makeDocxTable(header ?? [], body))
    }
  }

  if (!children.length) {
    children.push(new Paragraph({ text: '(Empty workbook)' }))
  }

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}

export async function blocksToDocxBuffer(blocks: DocxBlock[], title?: string): Promise<Buffer> {
  const headingLevels = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6
  ]
  const children: Array<Paragraph | Table> = []
  if (title && blocks[0]?.type !== 'heading') {
    children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }))
  }
  for (const block of blocks) {
    if (block.type === 'heading') {
      children.push(new Paragraph({
        text: block.text,
        heading: headingLevels[Math.min(5, Math.max(0, block.level - 1))]
      }))
    } else if (block.type === 'paragraph') {
      children.push(new Paragraph({ text: block.text, spacing: { after: 100 } }))
    } else if (block.type === 'list') {
      block.items.forEach((item, idx) => {
        children.push(new Paragraph({
          text: `${block.ordered ? `${idx + 1}.` : '•'} ${item}`,
          spacing: { after: 60 }
        }))
      })
    } else if (block.rows.length) {
      const [header, ...body] = block.rows
      children.push(makeDocxTable(header ?? [], body))
    }
  }
  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}

// ── Markdown / JSON / XML helpers ────────────────────────────────────────────

export function markdownToBlocks(md: string): DocxBlock[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: DocxBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!.trim()
    if (!line) {
      i++
      continue
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]!.length, text: heading[2]!.trim() })
      i++
      continue
    }

    // GFM table
    if (line.includes('|') && i + 1 < lines.length && /^\|?[\s:-]+\|/.test(lines[i + 1]!.trim())) {
      const parseMdRow = (raw: string) =>
        raw.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
      const rows: string[][] = [parseMdRow(line)]
      i += 2 // skip separator line
      while (i < lines.length && lines[i]!.trim().includes('|')) {
        rows.push(parseMdRow(lines[i]!.trim()))
        i++
      }
      blocks.push({ type: 'table', rows })
      continue
    }

    // Bullet / numbered list
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line)
      const items: string[] = []
      while (i < lines.length) {
        const cur = lines[i]!.trim()
        const m = ordered ? /^\d+\.\s+(.+)$/.exec(cur) : /^[-*]\s+(.+)$/.exec(cur)
        if (!m) break
        items.push(m[1]!.trim())
        i++
      }
      if (items.length) blocks.push({ type: 'list', ordered, items })
      continue
    }

    blocks.push({ type: 'paragraph', text: line })
    i++
  }

  return blocks
}

function mdTable(rows: string[][]): string {
  if (!rows.length) return ''
  const colCount = Math.max(...rows.map(r => r.length), 1)
  const norm = rows.map(r => Array.from({ length: colCount }, (_, idx) => String(r[idx] ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')))
  const header = `| ${norm[0]!.join(' | ')} |`
  const sep = `| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`
  const body = norm.slice(1).map(r => `| ${r.join(' | ')} |`)
  return [header, sep, ...body].join('\n')
}

export function blocksToMarkdown(blocks: DocxBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type === 'heading') {
      parts.push(`${'#'.repeat(Math.min(6, block.level))} ${block.text}`)
    } else if (block.type === 'paragraph') {
      parts.push(block.text)
    } else if (block.type === 'list') {
      parts.push(block.items.map((item, idx) => `${block.ordered ? `${idx + 1}.` : '-'} ${item}`).join('\n'))
    } else if (block.rows.length) {
      parts.push(mdTable(block.rows))
    }
  }
  return `${parts.join('\n\n')}\n`
}

export function sheetsToMarkdown(sheets: SheetGrid[]): string {
  return `${sheets.map(s => `## ${s.name}\n\n${mdTable(s.rows)}`).join('\n\n')}\n`
}

function rowsToRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return rows.map(r => ({ value: r.join(' | ') }))
  const headers = rows[0]!.map((h, i) => h.trim() || `col_${i + 1}`)
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {}
    headers.forEach((h, i) => {
      rec[h] = String(r[i] ?? '')
    })
    return rec
  })
}

export function sheetsToJsonValue(sheets: SheetGrid[]): unknown {
  if (sheets.length === 1) return rowsToRecords(sheets[0]!.rows)
  const out: Record<string, unknown> = {}
  for (const s of sheets) out[s.name] = rowsToRecords(s.rows)
  return out
}

export function jsonValueToSheets(value: unknown): SheetGrid[] {
  const toGrid = (name: string, arr: unknown[]): SheetGrid => {
    const keys: string[] = []
    const keySet = new Set<string>()
    for (const item of arr) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const k of Object.keys(item as Record<string, unknown>)) {
          if (!keySet.has(k)) {
            keySet.add(k)
            keys.push(k)
          }
        }
      }
    }
    if (!keys.length) {
      return { name, rows: [['Value'], ...arr.map(v => [String(v ?? '')])] }
    }
    const rows: string[][] = [
      keys,
      ...arr.map((item) => {
        const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
        return keys.map(k => (typeof rec[k] === 'object' && rec[k] !== null ? JSON.stringify(rec[k]) : String(rec[k] ?? '')))
      })
    ]
    return { name, rows }
  }

  if (Array.isArray(value)) return [toGrid('Data', value)]
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    const arrayEntries = Object.entries(rec).filter(([, v]) => Array.isArray(v))
    if (arrayEntries.length) {
      return arrayEntries.map(([k, v]) => toGrid(k.slice(0, 31), v as unknown[]))
    }
    return [{
      name: 'Data',
      rows: [['Key', 'Value'], ...Object.entries(rec).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')])]
    }]
  }
  return [{ name: 'Data', rows: [['Value'], [String(value ?? '')]] }]
}

// ── AI JSON Plan Parsers & Runners ──────────────────────────────────────────

function extractJsonPayload(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const candidates = [cleaned]
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1))
  const arrStart = cleaned.indexOf('[')
  const arrEnd = cleaned.lastIndexOf(']')
  if (arrStart >= 0 && arrEnd > arrStart) candidates.push(cleaned.slice(arrStart, arrEnd + 1))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // try next shape
    }
  }
  throw new DocumentError('DOCUMENT_AI_INVALID_RESPONSE')
}

export function parseAiXlsxPlan(raw: string): SheetGrid[] {
  const parsed = extractJsonPayload(raw) as Record<string, unknown>
  if (Array.isArray(parsed.sheets)) {
    const sheets: SheetGrid[] = []
    for (const s of parsed.sheets) {
      if (!s || typeof s !== 'object') continue
      const rec = s as Record<string, unknown>
      const cols = Array.isArray(rec.columns) ? rec.columns.map(c => String(c ?? '')) : []
      const rows = Array.isArray(rec.rows)
        ? rec.rows.filter(Array.isArray).map(r => (r as unknown[]).map(c => String(c ?? '')))
        : []
      const combined = cols.length ? [cols, ...rows] : rows
      if (combined.length) sheets.push({ name: String(rec.name ?? 'Sheet').slice(0, 31) || 'Sheet', rows: combined })
    }
    if (sheets.length) return sheets
  }

  const columns = Array.isArray(parsed.columns) ? parsed.columns.map(c => String(c ?? '')) : []
  const rows = Array.isArray(parsed.rows)
    ? parsed.rows.filter(Array.isArray).map(r => (r as unknown[]).map(c => String(c ?? '')))
    : []
  const combined = columns.length ? [columns, ...rows] : rows
  if (!combined.length) throw new DocumentError('DOCUMENT_AI_INVALID_RESPONSE')
  return [{ name: String(parsed.sheetName ?? 'Data').slice(0, 31) || 'Data', rows: combined }]
}

export function parseAiDocxPlan(raw: string): AiDocxPlan {
  const parsed = extractJsonPayload(raw) as Record<string, unknown>
  if (!Array.isArray(parsed.sections)) throw new DocumentError('DOCUMENT_AI_INVALID_RESPONSE')
  const sections: AiDocxPlan['sections'] = []
  for (const item of parsed.sections) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const tableRec = rec.table && typeof rec.table === 'object' ? rec.table as Record<string, unknown> : null
    sections.push({
      heading: typeof rec.heading === 'string' ? rec.heading.trim() : undefined,
      paragraphs: Array.isArray(rec.paragraphs) ? rec.paragraphs.map(p => String(p ?? '').trim()).filter(Boolean) : undefined,
      table: tableRec
        ? {
            headers: Array.isArray(tableRec.headers) ? tableRec.headers.map(h => String(h ?? '')) : [],
            rows: Array.isArray(tableRec.rows)
              ? tableRec.rows.filter(Array.isArray).map(r => (r as unknown[]).map(c => String(c ?? '')))
              : []
          }
        : undefined
    })
  }
  if (!sections.length) throw new DocumentError('DOCUMENT_AI_INVALID_RESPONSE')
  return {
    title: typeof parsed.title === 'string' ? parsed.title.trim() : undefined,
    sections
  }
}

async function runAiConversion(
  sourceText: string,
  target: OfficeConvertTarget,
  stem: string,
  config: OfficeConvertConfig,
  event: OperationExecutionContext['event']
): Promise<Buffer | string> {
  const modelTarget = await resolveExtractTarget(
    config.model ? { model: String(config.model), connectionId: config.connectionId ? String(config.connectionId) : undefined } : null,
    event
  )
  const guidance = config.aiPrompt?.trim()
    ? `\n\nYÊU CẦU TỪ NGƯỜI DÙNG:\n${config.aiPrompt.trim()}`
    : ''
  const clipped = sourceText.slice(0, 28_000)

  let systemPrompt: string
  if (target === 'xlsx' || target === 'csv') {
    systemPrompt = [
      'Bạn là trợ lý chuyển đổi tài liệu sang bảng dữ liệu.',
      'Hãy đọc nội dung nguồn và xuất ra ĐÚNG JSON theo mẫu:',
      '{ "sheets": [ { "name": "Sheet1", "columns": ["Cột 1", "Cột 2"], "rows": [["giá trị 1", "giá trị 2"]] } ] }',
      'Chỉ trả về JSON hợp lệ, không thêm giải thích hay markdown.'
    ].join('\n')
  } else if (target === 'docx' || target === 'md') {
    systemPrompt = [
      'Bạn là trợ lý chuyển đổi dữ liệu sang tài liệu chuyên nghiệp.',
      'Hãy đọc dữ liệu nguồn và trả về ĐÚNG JSON theo mẫu:',
      '{ "title": "Tiêu đề tài liệu", "sections": [ { "heading": "Tên mục", "paragraphs": ["Đoạn văn"], "table": { "headers": ["Cột 1"], "rows": [["Giá trị"]] } } ] }',
      'Chỉ trả về JSON hợp lệ, không thêm giải thích hay markdown.'
    ].join('\n')
  } else {
    systemPrompt = [
      'Bạn là trợ lý chuyển đổi và chuẩn hóa dữ liệu có cấu trúc.',
      'Hãy đọc dữ liệu nguồn và trả về ĐÚNG JSON hợp lệ phản ánh đầy đủ nội dung (theo yêu cầu người dùng nếu có).',
      'Chỉ trả về JSON hợp lệ, không thêm giải thích hay markdown.'
    ].join('\n')
  }

  const result = await chatWithConnection({
    connectionId: modelTarget.connectionId,
    model: modelTarget.model,
    systemPrompt,
    messages: [{ role: 'user', content: `Tài liệu nguồn: ${stem}\n${clipped}${guidance}` }],
    maxTokens: 16384,
    temperature: 0.15
  }, event)

  if (!result.content.trim()) throw new DocumentError('DOCUMENT_AI_EMPTY_RESPONSE')

  if (target === 'xlsx') return sheetsToXlsxBuffer(parseAiXlsxPlan(result.content))
  if (target === 'csv') return `\uFEFF${rowsToCsv(parseAiXlsxPlan(result.content)[0]!.rows)}`
  if (target === 'json') return `${JSON.stringify(extractJsonPayload(result.content), null, 2)}\n`
  if (target === 'xml') return `${jsonValueToXml('document', extractJsonPayload(result.content))}\n`

  const plan = parseAiDocxPlan(result.content)
  const blocks: DocxBlock[] = []
  if (plan.title) blocks.push({ type: 'heading', level: 1, text: plan.title })
  for (const sec of plan.sections) {
    if (sec.heading) blocks.push({ type: 'heading', level: 2, text: sec.heading })
    for (const p of sec.paragraphs ?? []) blocks.push({ type: 'paragraph', text: p })
    if (sec.table && (sec.table.headers.length || sec.table.rows.length)) {
      blocks.push({
        type: 'table',
        rows: sec.table.headers.length ? [sec.table.headers, ...sec.table.rows] : sec.table.rows
      })
    }
  }
  return target === 'md' ? blocksToMarkdown(blocks) : blocksToDocxBuffer(blocks, stem)
}

export class OfficeConvertExecutor implements DocumentOperationExecutor<OfficeConvertConfig> {
  readonly operationId = 'office.convert' as const

  async validateInputs(inputs: VerifiedInput[], config: OfficeConvertConfig = {}): Promise<ValidationResult> {
    if (inputs.length !== 1) return { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
    const ext = extOf(inputs[0]!)
    if (!(OFFICE_SOURCE_EXTS as readonly string[]).includes(ext)) {
      return { ok: false, issues: [{ code: 'DOCUMENT_INPUT_TYPE_NOT_SUPPORTED' }] }
    }
    try {
      resolveOfficeTarget(ext, config.target)
    } catch {
      return { ok: false, issues: [{ code: 'DOCUMENT_OPERATION_CONFIG_INVALID', details: { field: 'target' } }] }
    }
    return { ok: true, issues: [] }
  }

  async execute(context: OperationExecutionContext, config: OfficeConvertConfig = {}) {
    const input = single(context.inputs)
    const source = extOf(input)
    const target = resolveOfficeTarget(source, config.target)
    const stem = stemOf(input.safeName)
    const bytes = readFileSync(input.stagedPath)
    await context.onProgress({ totalUnits: 1, completedUnits: 0 })

    // 1. Parse source into intermediate blocks / sheets / raw text
    let blocks: DocxBlock[] | null = null
    let sheets: SheetGrid[] | null = null
    let rawJson: unknown = null

    if (source === 'docx') {
      blocks = await docxToBlocks(bytes)
    } else if (source === 'doc') {
      const converted = tryLibreOfficeConvert(bytes, 'doc', 'docx')
      blocks = converted ? await docxToBlocks(converted) : extractLegacyDocBlocks(bytes)
    } else if (source === 'md') {
      blocks = markdownToBlocks(bytes.toString('utf8'))
    } else if (source === 'xlsx') {
      sheets = await readWorkbookSheets(bytes)
    } else if (source === 'xls') {
      const converted = tryLibreOfficeConvert(bytes, 'xls', 'xlsx')
      if (!converted) throw new DocumentError('DOCUMENT_INPUT_TYPE_NOT_SUPPORTED')
      sheets = await readWorkbookSheets(converted)
    } else if (source === 'csv') {
      sheets = [{ name: stem.slice(0, 31) || 'Data', rows: csvToRows(bytes.toString('utf8')) }]
    } else if (source === 'json') {
      rawJson = JSON.parse(bytes.toString('utf8')) as unknown
      sheets = jsonValueToSheets(rawJson)
    } else if (source === 'xml') {
      rawJson = xmlToJsonValue(bytes.toString('utf8'))
      sheets = jsonValueToSheets(rawJson)
    }

    let out: Buffer | string
    if (config.useAi) {
      const sourceText = blocks
        ? docxBlocksToText(blocks)
        : rawJson !== null
          ? JSON.stringify(rawJson, null, 2)
          : (sheets ?? []).map(s => `### ${s.name}\n${s.rows.slice(0, 150).map(r => r.join(' | ')).join('\n')}`).join('\n\n')
      out = await runAiConversion(sourceText, target, stem, config, context.event)
    } else {
      const resolvedSheets = sheets ?? blocksToSheets(blocks ?? [])
      const resolvedBlocks = blocks ?? resolvedSheets.flatMap(s => [
        { type: 'heading' as const, level: 2, text: s.name },
        ...(s.rows.length ? [{ type: 'table' as const, rows: s.rows }] : [])
      ])

      if (target === 'xlsx') {
        out = await sheetsToXlsxBuffer(resolvedSheets)
      } else if (target === 'docx') {
        out = blocks ? await blocksToDocxBuffer(blocks, stem) : await sheetsToDocxBuffer(resolvedSheets, stem)
      } else if (target === 'csv') {
        out = `\uFEFF${rowsToCsv(resolvedSheets[0]?.rows ?? [])}`
      } else if (target === 'md') {
        out = blocks ? blocksToMarkdown(blocks) : sheetsToMarkdown(resolvedSheets)
      } else if (target === 'json') {
        const jsonVal = rawJson ?? (sheets ? sheetsToJsonValue(sheets) : sheetsToJsonValue(resolvedSheets))
        out = `${JSON.stringify(jsonVal, null, 2)}\n`
      } else {
        const xmlPayload = rawJson ?? (sheets ? { sheets: sheetsToJsonValue(sheets) } : { blocks: resolvedBlocks })
        out = `${jsonValueToXml('document', xmlPayload)}\n`
      }
    }

    const fileName = `${stem}.${target}`
    const outPath = join(context.workspace.outputDir, fileName)
    writeFileAtomic(outPath, typeof out === 'string' ? out : new Uint8Array(out))
    await context.onProgress({ totalUnits: 1, completedUnits: 1 })
    return { files: [{ fileName, mimeType: MIME_BY_TARGET[target], path: outPath, size: statSync(outPath).size }] }
  }
}
