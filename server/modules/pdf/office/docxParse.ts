import mammoth from 'mammoth'

/**
 * Word documents reach us in two shapes: a PDF for printing/vision and a text
 * form for the (much cheaper) text-only extraction path. Both start from the
 * same block list so a table never gets mistaken for a paragraph.
 */
export type DocxBlock
  = | { type: 'heading', level: number, text: string }
    | { type: 'paragraph', text: string }
    | { type: 'list', ordered: boolean, items: string[] }
    | { type: 'table', rows: string[][] }

const ENTITIES: Record<string, string> = {
  'amp': '&',
  'lt': '<',
  'gt': '>',
  'quot': '"',
  'apos': '\'',
  'nbsp': ' ',
  '#39': '\''
}

function decodeEntities(value: string): string {
  return value.replace(/&(#?\w+);/g, (match, entity: string) => ENTITIES[entity] ?? match)
}

function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim()
}

function parseTable(tableHtml: string): string[][] {
  const rows: string[][] = []
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? []

  for (const rowHtml of rowMatches) {
    const cells = (rowHtml.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(textOf)
    if (cells.some(cell => cell.length > 0)) rows.push(cells)
  }

  return rows
}

/**
 * Mammoth emits a small, predictable subset of HTML (h1-h6, p, ul/ol/li and
 * table/tr/td), so a full HTML parser would be dead weight here. Blocks are
 * scanned in document order — a table first alternative wins at its own
 * position, so the `<p>` tags inside its cells never surface separately.
 */
const BLOCK_RE = /<table[\s\S]*?<\/table>|<h[1-6][\s\S]*?<\/h[1-6]>|<p[\s\S]*?<\/p>|<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>/gi

export async function docxToBlocks(buffer: Buffer): Promise<DocxBlock[]> {
  const { value } = await mammoth.convertToHtml({ buffer })
  const blocks: DocxBlock[] = []

  for (const match of value.match(BLOCK_RE) ?? []) {
    const openTag = /^<(\w+)/.exec(match)?.[1]?.toLowerCase() ?? ''

    if (openTag === 'table') {
      const rows = parseTable(match)
      if (rows.length) blocks.push({ type: 'table', rows })
      continue
    }

    if (openTag === 'ul' || openTag === 'ol') {
      const items = (match.match(/<li[\s\S]*?<\/li>/gi) ?? [])
        .map(item => textOf(item))
        .filter(Boolean)
      if (items.length) blocks.push({ type: 'list', ordered: openTag === 'ol', items })
      continue
    }

    if (openTag.startsWith('h')) {
      const text = textOf(match)
      if (text) blocks.push({ type: 'heading', level: Number(openTag.slice(1)) || 1, text })
      continue
    }

    const text = textOf(match)
    if (text) blocks.push({ type: 'paragraph', text })
  }

  return blocks
}

/**
 * Flat text for the model. Table rows use ` | ` so the column order survives;
 * the extraction prompt explains that convention.
 */
export function docxBlocksToText(blocks: DocxBlock[]): string {
  const lines: string[] = []

  for (const block of blocks) {
    if (block.type === 'heading') lines.push(`${'#'.repeat(Math.min(6, block.level))} ${block.text}`)
    else if (block.type === 'paragraph') lines.push(block.text)
    else if (block.type === 'list') {
      block.items.forEach((item, index) => lines.push(`${block.ordered ? `${index + 1}.` : '-'} ${item}`))
    } else {
      block.rows.forEach(row => lines.push(row.join(' | ')))
    }
  }

  return lines.join('\n')
}

export async function docxToText(buffer: Buffer): Promise<string> {
  return docxBlocksToText(await docxToBlocks(buffer))
}
