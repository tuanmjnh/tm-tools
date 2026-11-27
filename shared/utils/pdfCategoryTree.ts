import type { PdfCategoryMatchMode, PdfCategoryNode } from '#shared/types/pdf'

export interface CategoryImportTable {
  headers: string[]
  rows: Record<string, string>[]
}

export interface CategoryColumnMapping {
  title: string
  slug: string
  pid?: string
  matchers?: string
}

const MAX_CATEGORY_NODES = 500

export function normalizeCategoryMode(raw: unknown): PdfCategoryMatchMode | undefined {
  if (raw === 'system' || raw === 'ai' || raw === 'auto') return raw
  return undefined
}

export function sanitizeCategoryNodes(raw: unknown): PdfCategoryNode[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: PdfCategoryNode[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const slug = String(rec.slug ?? '').trim().slice(0, 120)
    const title = String(rec.title ?? '').trim().slice(0, 160)
    if (!slug || !title || seen.has(slug)) continue
    seen.add(slug)

    const pid = String(rec.pid ?? '').trim().slice(0, 120)
    const rawMatchers = Array.isArray(rec.matchers)
      ? rec.matchers
      : typeof rec.matchers === 'string'
        ? rec.matchers.split(',')
        : []
    const matchers = rawMatchers
      .map(m => String(m ?? '').trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 30)

    const node: PdfCategoryNode = { title, slug }
    if (pid) node.pid = pid
    if (matchers.length) node.matchers = matchers
    out.push(node)
    if (out.length >= MAX_CATEGORY_NODES) break
  }

  return out
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

/**
 * Parses a JSON array or CSV string into a generic header+rows table so the
 * preset modal can map arbitrary column names (`title`, `slug`, `pid`, `matchers`).
 */
export function parseCategoryImport(rawText: string): CategoryImportTable | null {
  const trimmed = rawText.replace(/^\uFEFF/, '').trim()
  if (!trimmed) return null

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { categories?: unknown[] }).categories)
          ? (parsed as { categories: unknown[] }).categories
          : null
      if (!arr || !arr.length) return null
      const headerSet = new Set<string>()
      const rows: Record<string, string>[] = []
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue
        const row: Record<string, string> = {}
        for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
          headerSet.add(k)
          row[k] = Array.isArray(v) ? v.map(x => String(x ?? '')).join(', ') : String(v ?? '')
        }
        rows.push(row)
      }
      return rows.length ? { headers: [...headerSet], rows } : null
    } catch {
      return null
    }
  }

  const lines = trimmed.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return null
  const headers = parseCsvLine(lines[0]!).filter(Boolean)
  if (!headers.length) return null
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!)
    const row: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]!] = cells[c] ?? ''
    }
    rows.push(row)
  }
  return rows.length ? { headers, rows } : null
}

export function guessCategoryColumns(headers: string[]): CategoryColumnMapping {
  const pick = (candidates: string[], fallback = '') =>
    headers.find(h => candidates.includes(h.toLowerCase().trim())) ?? fallback

  return {
    title: pick(['title', 'name', 'ten', 'category', 'label'], headers[0] ?? ''),
    slug: pick(['slug', 'id', 'code', 'key'], headers[1] ?? headers[0] ?? ''),
    pid: pick(['pid', 'parent', 'parentid', 'parent_id', 'parentslug', 'parent_slug']),
    matchers: pick(['matchers', 'keywords', 'sku', 'skus', 'prefixes', 'tags'])
  }
}

export function applyCategoryMapping(
  table: CategoryImportTable,
  mapping: CategoryColumnMapping
): PdfCategoryNode[] {
  const rawNodes = table.rows.map(row => ({
    title: mapping.title ? row[mapping.title] ?? '' : '',
    slug: mapping.slug ? row[mapping.slug] ?? '' : '',
    pid: mapping.pid ? row[mapping.pid] ?? '' : '',
    matchers: mapping.matchers ? row[mapping.matchers] ?? '' : ''
  }))
  return sanitizeCategoryNodes(rawNodes)
}

/**
 * Builds `slug -> "root,...,leaf"` for every node by walking `pid` upward with
 * a cycle guard so a malformed parent reference never hangs.
 */
export function buildCategoryPathMap(nodes: PdfCategoryNode[]): Map<string, string> {
  const bySlug = new Map<string, PdfCategoryNode>()
  for (const node of nodes) bySlug.set(node.slug, node)

  const pathMap = new Map<string, string>()
  for (const node of nodes) {
    const chain: string[] = []
    const visited = new Set<string>()
    let cursor: PdfCategoryNode | undefined = node
    while (cursor && !visited.has(cursor.slug)) {
      visited.add(cursor.slug)
      chain.unshift(cursor.slug)
      cursor = cursor.pid ? bySlug.get(cursor.pid) : undefined
    }
    pathMap.set(node.slug, chain.join(','))
  }
  return pathMap
}

/**
 * Resolves either a leaf slug (`"hoc-ban"`) or a comma-separated path returned
 * by AI into the canonical full `root,...,leaf` path from `pathMap`.
 */
export function resolveCategoryPath(
  slugOrPath: string | null | undefined,
  pathMap: Map<string, string>
): string | null {
  const raw = String(slugOrPath ?? '').trim()
  if (!raw || pathMap.size === 0) return null
  if (pathMap.has(raw)) return pathMap.get(raw)!

  const parts = raw.split(',').map(p => p.trim()).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const resolved = pathMap.get(parts[i]!)
    if (resolved) return resolved
  }
  return null
}

function foldVietnamese(input: string): string {
  return input
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Zero-token deterministic matcher:
 * 1. Explicit `node.matchers` (SKU prefix or keyword match) wins immediately.
 * 2. Otherwise scores `node.title` tokens against `sku + title + description`,
 *    breaking ties in favor of deeper (more specific) category nodes.
 */
export function matchCategoryBySystem(
  text: string,
  sku: string,
  nodes: PdfCategoryNode[],
  pathMap: Map<string, string>
): string | null {
  if (!nodes.length) return null

  const normSku = sku.trim().toUpperCase()
  const normText = foldVietnamese(`${sku} ${text}`)

  // 1. Explicit matchers (SKU prefixes / keywords)
  for (const node of nodes) {
    if (!node.matchers?.length) continue
    for (const rawMatcher of node.matchers) {
      const m = rawMatcher.trim()
      if (!m) continue
      const upper = m.toUpperCase()
      if (normSku && /^[A-Z0-9_-]+$/.test(upper) && normSku.startsWith(upper)) {
        return pathMap.get(node.slug) ?? node.slug
      }
      const folded = foldVietnamese(m)
      if (folded && normText.includes(folded)) {
        return pathMap.get(node.slug) ?? node.slug
      }
    }
  }

  // 2. Title phrase / token overlap scoring
  let bestSlug = ''
  let bestScore = 0
  let bestDepth = 0

  for (const node of nodes) {
    const normTitle = foldVietnamese(node.title)
    if (!normTitle) continue
    const path = pathMap.get(node.slug) ?? node.slug
    const depth = path.split(',').length

    let score = 0
    if (normText.includes(normTitle)) {
      score = 100 + normTitle.length
    } else {
      const tokens = normTitle.split(' ').filter(t => t.length >= 2)
      if (!tokens.length) continue
      let hits = 0
      for (const token of tokens) {
        if (normText.includes(token)) hits++
      }
      if (hits > 0 && hits >= Math.ceil(tokens.length * 0.6)) {
        score = Math.round((hits / tokens.length) * 50) + hits * 4
      }
    }

    if (score > bestScore || (score === bestScore && score > 0 && depth > bestDepth)) {
      bestScore = score
      bestDepth = depth
      bestSlug = node.slug
    }
  }

  return bestSlug ? (pathMap.get(bestSlug) ?? bestSlug) : null
}

/** Compact list for the AI prompt: `<title> => <slug>`. */
export function formatCategoriesForPrompt(nodes: PdfCategoryNode[]): string {
  return nodes.map(n => `- ${n.title} => ${n.slug}`).join('\n')
}
