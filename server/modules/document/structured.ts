/**
 * Structured-data conversions for the Convert tool: CSV ↔ rows and XML ↔ JSON.
 *
 * These are deliberately small and rule-bound rather than a general parser,
 * because the failure mode of "smart" XML→JSON is silent data loss. The rules,
 * written down so a result is predictable:
 *
 *   XML → JSON
 *   - attributes become `@name`
 *   - element text becomes `#text` when the element also has attributes or
 *     children; a pure-text element becomes the plain string
 *   - repeated sibling names collapse to an array
 *   - the root element's name is NOT included (its children are the object)
 *
 *   JSON → XML
 *   - the caller supplies the root element name
 *   - `@name` keys become attributes, `#text` becomes text, arrays repeat the tag
 *   - primitives stringify; null/undefined become an empty element
 *
 * Malformed XML throws `XML_INVALID` rather than returning a partial tree.
 */

// ── CSV ─────────────────────────────────────────────────────────────────────

/** RFC4180-ish parser: quoted fields, escaped quotes, CRLF or LF, ragged rows padded. */
export function csvToRows(text: string): string[][] {
  const grid: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (ch === '\n') {
      row.push(field)
      grid.push(row)
      row = []
      field = ''
      continue
    }
    if (ch === '\r') continue
    field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    grid.push(row)
  }

  const rows = grid.filter(cells => cells.some(cell => cell.trim() !== ''))
  const width = rows.reduce((max, cells) => Math.max(max, cells.length), 0)
  for (const cells of rows) {
    while (cells.length < width) cells.push('')
  }
  return rows
}

function csvCell(value: string): string {
  const raw = String(value ?? '')
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
}

export function rowsToCsv(rows: string[][]): string {
  return rows.map(cells => cells.map(csvCell).join(',')).join('\n') + '\n'
}

// ── XML → JSON ────────────────────────────────────────────────────────────────

interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

/** A compact, non-validating XML reader: enough for data files, strict on structure. */
function parseXml(xml: string): XmlNode {
  const src = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim()
  let index = 0

  function skipWs() {
    while (index < src.length && /\s/.test(src[index]!)) index++
  }

  function parseElement(): XmlNode {
    if (src[index] !== '<') throw new Error('XML_INVALID')
    index++ // consume '<'
    let name = ''
    while (index < src.length && /[^\s/>]/.test(src[index]!)) name += src[index++]
    if (!name) throw new Error('XML_INVALID')

    const attrs: Record<string, string> = {}
    for (;;) {
      skipWs()
      const ch = src[index]
      if (ch === undefined) throw new Error('XML_INVALID')
      if (ch === '/' || ch === '>') break
      let attr = ''
      while (index < src.length && /[^\s=/>]/.test(src[index]!)) attr += src[index++]
      skipWs()
      if (src[index] !== '=') throw new Error('XML_INVALID')
      index++
      skipWs()
      const quote = src[index]
      if (quote !== '"' && quote !== '\'') throw new Error('XML_INVALID')
      index++
      let value = ''
      while (index < src.length && src[index] !== quote) {
        value += src[index++]
      }
      if (src[index] !== quote) throw new Error('XML_INVALID')
      index++
      attrs[attr] = decodeEntities(value)
    }

    const node: XmlNode = { name, attrs, children: [], text: '' }

    if (src[index] === '/') {
      if (src[index + 1] !== '>') throw new Error('XML_INVALID')
      index += 2
      return node
    }
    if (src[index] !== '>') throw new Error('XML_INVALID')
    index++

    // Content: text and child elements until the matching close tag.
    for (;;) {
      if (index >= src.length) throw new Error('XML_INVALID')
      if (src[index] === '<' && src[index + 1] === '/') {
        index += 2
        let closeName = ''
        while (index < src.length && /[^\s>]/.test(src[index]!)) closeName += src[index++]
        skipWs()
        if (src[index] !== '>') throw new Error('XML_INVALID')
        index++
        if (closeName !== name) throw new Error('XML_INVALID')
        break
      }
      if (src[index] === '<') {
        node.children.push(parseElement())
        continue
      }
      let text = ''
      while (index < src.length && src[index] !== '<') {
        text += src[index++]
      }
      node.text += decodeEntities(text)
    }

    node.text = node.text.trim()
    return node
  }

  const root = parseElement()
  skipWs()
  if (index < src.length) throw new Error('XML_INVALID')
  return root
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&')
}

function nodeToValue(node: XmlNode): unknown {
  const hasAttrs = Object.keys(node.attrs).length > 0
  const hasChildren = node.children.length > 0
  const hasText = node.text.length > 0

  // Pure text leaf collapses to the string; otherwise it joins any siblings.
  if (!hasAttrs && !hasChildren) return node.text

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.attrs)) out[`@${key}`] = value
  if (hasText) out['#text'] = node.text
  for (const child of node.children) {
    const existing = out[child.name]
    const value = nodeToValue(child)
    if (existing === undefined) out[child.name] = value
    else if (Array.isArray(existing)) existing.push(value)
    else out[child.name] = [existing, value]
  }
  return out
}

/** Returns the root element's children as an object (root name dropped). */
export function xmlToJsonValue(xml: string): Record<string, unknown> {
  const root = parseXml(xml)
  const value = nodeToValue(root)
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return { '#text': value }
}

// ── JSON → XML ────────────────────────────────────────────────────────────────

function escXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function safeTag(name: string): string {
  const cleaned = String(name).replace(/[^A-Za-z0-9_.-]/g, '_')
  const tag = cleaned && /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`
  return tag || '_'
}

function valueToXml(tag: string, value: unknown): string {
  const name = safeTag(tag)
  if (value === null || value === undefined) return `<${name}/>`
  if (Array.isArray(value)) return value.map(item => valueToXml(name, item)).join('')
  if (typeof value !== 'object') return `<${name}>${escXml(String(value))}</${name}>`

  const record = value as Record<string, unknown>
  const attrs: string[] = []
  let text = ''
  const children: string[] = []
  for (const [key, val] of Object.entries(record)) {
    if (key.startsWith('@')) attrs.push(` ${safeTag(key.slice(1))}="${escXml(String(val ?? ''))}"`)
    else if (key === '#text') text = escXml(String(val ?? ''))
    else children.push(valueToXml(key, val))
  }
  const attrStr = attrs.join('')
  if (!text && !children.length) return `<${name}${attrStr}/>`
  return `<${name}${attrStr}>${text}${children.join('')}</${name}>`
}

/** Wraps one value under the caller's root element. */
export function jsonValueToXml(rootName: string, value: unknown): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${valueToXml(rootName, value)}`
}
