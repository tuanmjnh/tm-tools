import ExcelJS from 'exceljs'

/** Non-PDF files the workspace can read and turn into a PDF. */
export type PdfInputKind = 'image' | 'docx' | 'xlsx' | 'csv' | 'json' | 'xml'

export interface ParsedTable {
  title: string
  rows: string[][]
}

const MAX_ROWS = 3000
const MAX_COLUMNS = 40

export function inputKind(name: string): PdfInputKind | null {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  // pdf-lib can only embed PNG and JPEG, so other image formats are rejected at
  // upload time instead of being stored and then failing at conversion.
  if (['png', 'jpg', 'jpeg'].includes(extension)) return 'image'
  if (extension === 'docx') return 'docx'
  if (extension === 'xlsx') return 'xlsx'
  if (extension === 'csv') return 'csv'
  if (extension === 'json') return 'json'
  if (extension === 'xml') return 'xml'
  return null
}

export function isDataName(name: string): boolean {
  return ['xlsx', 'csv', 'json', 'xml'].includes(name.split('.').pop()?.toLowerCase() ?? '')
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ')
  if (typeof value === 'object') {
    const rich = value as { richText?: { text: string }[], text?: string, result?: unknown, formula?: string }
    if (Array.isArray(rich.richText)) return rich.richText.map(part => part.text).join('')
    if (typeof rich.text === 'string') return rich.text
    if (rich.result !== undefined) return String(rich.result)
    if (rich.formula) return `=${rich.formula}`
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function trimRows(rows: string[][]): string[][] {
  const cleaned = rows
    .map(row => row.map(value => cell(value).replace(/\s+/g, ' ').trim()))
    .filter(row => row.some(value => value !== ''))
  return cleaned.slice(0, MAX_ROWS).map(row => row.slice(0, MAX_COLUMNS))
}

/** RFC4180-ish reader; the delimiter is sniffed from the header line. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '')
  const header = input.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = ['\t', ';', ','].sort((a, b) => header.split(b).length - header.split(a).length)[0] ?? ','

  const rows: string[][] = []
  let row: string[] = []
  let cellValue = ''
  let quoted = false

  for (let index = 0; index < input.length; index++) {
    const char = input[index]

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cellValue += '"'
          index++
        } else {
          quoted = false
        }
      } else {
        cellValue += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cellValue)
      cellValue = ''
    } else if (char === '\n') {
      row.push(cellValue)
      rows.push(row)
      row = []
      cellValue = ''
    } else if (char !== '\r') {
      cellValue += char
    }
  }

  if (cellValue !== '' || row.length > 0) {
    row.push(cellValue)
    rows.push(row)
  }

  return trimRows(rows)
}

function objectRows(items: unknown[]): string[][] {
  if (!items.length) return []

  if (items.every(item => Array.isArray(item))) {
    return trimRows(items as string[][])
  }

  if (items.every(item => item && typeof item === 'object')) {
    const columns: string[] = []
    for (const item of items) {
      for (const key of Object.keys(item as Record<string, unknown>)) {
        if (!columns.includes(key)) columns.push(key)
      }
    }
    const rows = [columns]
    for (const item of items) {
      const record = item as Record<string, unknown>
      rows.push(columns.map((key) => {
        const value = record[key]
        if (value && typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value)
        if (Array.isArray(value)) return value.map(entry => cell(entry)).join(', ')
        return cell(value)
      }))
    }
    return trimRows(rows)
  }

  return trimRows(items.map(item => [cell(item)]))
}

/** Accepts an array, a wrapper object (`data`/`items`/…) or a key/value document. */
export function parseJson(text: string): string[][] {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return trimRows(text.split(/\r?\n/).map(line => [line]))
  }

  if (Array.isArray(payload)) return objectRows(payload)

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const arrayKey = Object.keys(record).find(key => Array.isArray(record[key]))
    if (arrayKey) return objectRows(record[arrayKey] as unknown[])

    const rows: string[][] = [['key', 'value']]
    for (const [key, value] of Object.entries(record)) {
      rows.push([key, value && typeof value === 'object' ? JSON.stringify(value) : cell(value)])
    }
    return trimRows(rows)
  }

  return trimRows([[cell(payload)]])
}

interface XmlNode {
  name: string
  text: string
  children: XmlNode[]
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}

function parseXmlTree(xml: string): XmlNode[] {
  const source = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, data: string) => decodeEntities(data))

  const root: XmlNode = { name: '#root', text: '', children: [] }
  const stack: XmlNode[] = [root]
  const tagPattern = /<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = tagPattern.exec(source))) {
    const depthNode = stack[stack.length - 1]!
    const text = source.slice(cursor, match.index).trim()
    if (text) depthNode.text += decodeEntities(text)
    cursor = tagPattern.lastIndex

    const [, closing, name, , selfClosing] = match
    if (closing) {
      if (stack.length > 1) stack.pop()
      continue
    }

    const node: XmlNode = { name: name!, text: '', children: [] }
    depthNode.children.push(node)
    if (!selfClosing) stack.push(node)
  }

  return root.children
}

function nodeRow(node: XmlNode): { columns: string[], values: Record<string, string> } {
  const values: Record<string, string> = {}
  const columns: string[] = []

  const walk = (current: XmlNode, prefix: string) => {
    for (const child of current.children) {
      const key = prefix ? `${prefix}.${child.name}` : child.name
      if (child.children.length > 0) {
        walk(child, key)
      } else {
        if (!columns.includes(key)) columns.push(key)
        values[key] = (values[key] ? `${values[key]} ${child.text}` : child.text).trim()
      }
    }
    if (!current.children.length && current.text && !prefix) {
      const key = current.name
      if (!columns.includes(key)) columns.push(key)
      values[key] = current.text
    }
  }

  walk(node, '')
  if (!columns.length && node.text) {
    columns.push(node.name)
    values[node.name] = node.text
  }
  return { columns, values }
}

/** Repeated child elements become rows; anything else folds into a tag/value table. */
export function parseXml(text: string): string[][] {
  const tree = parseXmlTree(text)
  const root = tree[0]
  if (!root) return trimRows(text.split(/\r?\n/).map(line => [line]))

  let items = root.children
  if (items.length < 2) {
    const deeper = items[0]?.children ?? []
    if (deeper.length >= 2) items = deeper
  }

  if (items.length >= 2) {
    const parsed = items.map(nodeRow)
    const columns: string[] = []
    for (const entry of parsed) {
      for (const column of entry.columns) {
        if (!columns.includes(column)) columns.push(column)
      }
    }
    if (columns.length) {
      return trimRows([columns, ...parsed.map(entry => columns.map(column => entry.values[column] ?? ''))])
    }
  }

  const rows: string[][] = []
  const collect = (node: XmlNode) => {
    if (!node.children.length) {
      rows.push([node.name, node.text])
      return
    }
    for (const child of node.children) collect(child)
  }
  collect(root)
  const single = rows.filter(row => row[0] !== root.name)
  return trimRows([['tag', 'value'], ...(single.length ? single : rows)])
}

export async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []

  const rows: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[]
    rows.push(values.slice(1).map(value => cell(value)))
  })
  return trimRows(rows)
}

/** Reads any supported tabular input into a header + data matrix. */
export async function parseTabular(name: string, buffer: Buffer): Promise<ParsedTable | null> {
  const kind = inputKind(name)
  const title = name.replace(/\.[^.]+$/, '')
  if (kind === 'csv') return { title, rows: parseCsv(buffer.toString('utf8')) }
  if (kind === 'json') return { title, rows: parseJson(buffer.toString('utf8')) }
  if (kind === 'xml') return { title, rows: parseXml(buffer.toString('utf8')) }
  if (kind === 'xlsx') return { title, rows: await parseXlsx(buffer) }
  return null
}

/** Serializes extracted rows as XML so the export ecosystem has a 5th target. */
export function rowsToXml(rows: object[], rootName = 'products', itemName = 'product'): string {
  const escape = (value: string) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<${rootName} count="${rows.length}">`]

  for (const row of rows) {
    lines.push(`  <${itemName}>`)
    for (const [key, value] of Object.entries(row)) {
      const tag = key.replace(/[^\w.:-]/g, '_') || 'field'
      lines.push(`    <${tag}>${escape(value)}</${tag}>`)
    }
    lines.push(`  </${itemName}>`)
  }

  lines.push(`</${rootName}>`)
  return `${lines.join('\n')}\n`
}
