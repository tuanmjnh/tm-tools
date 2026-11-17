import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { H3Event } from 'h3'
import { pdf } from 'pdf-to-img'
import type {
  PdfExtractPage,
  PdfExtractProduct,
  PdfExtractVariant
} from '#shared/types/pdf'
import { config } from '#server/config'
import { chatWithConnection } from '../../../utils/aiGateway'
import { buildPagePrompt, buildSystemPrompt, buildTextChunkPrompt } from './prompt'
import type { PdfExtractTarget } from './models'
import type { PdfExtractInstructions } from './presets'

/**
 * Absolute URL of pdf.js's bundled standard fonts. Resolved once: the package
 * layout does not change while the process runs.
 */
let standardFontsPath: string | null = null
function standardFontsUrl(): string | undefined {
  if (standardFontsPath !== null) return standardFontsPath || undefined
  try {
    const require = createRequire(import.meta.url)
    const pdfjsDir = dirname(require.resolve('pdfjs-dist/package.json'))
    // pdf.js validates a trailing forward slash, not the OS separator, so a
    // Windows `\` is rejected outright ("must include trailing slash").
    standardFontsPath = `${join(pdfjsDir, 'standard_fonts').replace(/\\/g, '/')}/`
  } catch {
    // A layout without pdfjs-dist beside this module still renders; it only
    // falls back to substitute fonts, which is what we had before the fix.
    standardFontsPath = ''
  }
  return standardFontsPath || undefined
}

class PdfProviderError extends Error {
  status: number

  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function parseVariant(raw: unknown): PdfExtractVariant {
  const record = (raw ?? {}) as Record<string, unknown>
  return {
    opt1Val: asString(record.opt1Val).trim(),
    price: asString(record.price).trim()
  }
}

function parseProduct(raw: unknown): PdfExtractProduct | null {
  const record = (raw ?? {}) as Record<string, unknown>
  const sku = asString(record.sku).trim()
  if (!sku) return null

  const variants = Array.isArray(record.variants)
    ? record.variants.map(parseVariant)
    : []

  return {
    sku,
    title: asString(record.title).trim() || sku,
    isNewProduct: record.isNewProduct === true,
    width: asString(record.width).trim(),
    depth: asString(record.depth).trim(),
    height: asString(record.height).trim(),
    description: asString(record.description).trim(),
    shortDesc: asString(record.shortDesc).trim(),
    opt1Name: asString(record.opt1Name).trim(),
    variants
  }
}

function parsePage(payload: unknown, pageId: string): PdfExtractPage {
  if (!payload || typeof payload !== 'object') {
    throw new PdfProviderError('PDF_AI_INVALID_RESPONSE')
  }

  const record = payload as Record<string, unknown>
  if (!Array.isArray(record.products)) {
    throw new PdfProviderError('PDF_AI_INVALID_RESPONSE')
  }

  const products = record.products
    .map(parseProduct)
    .filter((product): product is PdfExtractProduct => product !== null)

  return {
    pageId,
    pageCategorySlugs: asString(record.pageCategorySlugs).trim(),
    products
  }
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof PdfProviderError)) return true
  // A truncated answer is a budget problem, not a transient one: the same
  // request against the same budget produces the same cut, so retrying only
  // costs time and tokens.
  if (error instanceof PdfProviderError && error.message === 'PDF_AI_OUTPUT_TRUNCATED') return false
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Output budget for one page; a full price table does not fit in 8192. */
function maxOutputTokens(): number {
  return config.pdf.extract.maxOutputTokens
}

/**
 * Renders the single-page PDF to PNG so the page can be sent to any vision
 * model: every provider accepts an image part, while only some accept a PDF.
 *
 * `pdf-to-img` builds `standardFontDataUrl` with `path.posix`, so on Windows the
 * value is a relative `standard_fonts/` that never resolves and every embedded
 * PDF font falls back to the built-in one. Passing an absolute URL restores the
 * glyphs; without it a page's own typography is lost in the image we send.
 */
async function renderPage(buffer: Buffer): Promise<Buffer> {
  const document = await pdf(buffer, {
    scale: config.pdf.imageScale,
    docInitParams: { standardFontDataUrl: standardFontsUrl() }
  })
  try {
    if (document.length < 1) throw new PdfProviderError('PDF_AI_EMPTY_PAGE')
    return await document.getPage(1)
  } finally {
    await document.destroy()
  }
}

/**
 * Models often wrap JSON in a fenced block or add prose around it. When the
 * output budget ran out the JSON is also cut mid-token, and no repair helps —
 * that case is reported separately so the caller can raise the budget instead
 * of retrying the same request forever.
 */
function extractJson(text: string, usage?: { outputTokens?: number } | null): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const candidates = [cleaned]

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // try the next shape
    }
  }

  const budget = maxOutputTokens()
  const spent = usage?.outputTokens ?? 0
  if (spent > 0 && spent >= budget * 0.95) throw new PdfProviderError('PDF_AI_OUTPUT_TRUNCATED')
  throw new PdfProviderError('PDF_AI_INVALID_JSON')
}

/** Turns a relay/H3 failure into a stable PDF code the job state can store. */
function toProviderError(error: unknown): PdfProviderError {
  if (error instanceof PdfProviderError) return error

  const record = (error ?? {}) as {
    statusCode?: number
    statusMessage?: string
    message?: string
    data?: { detail?: string }
  }
  const status = typeof record.statusCode === 'number' ? record.statusCode : 0
  const code = String(record.statusMessage || record.message || '').trim()
  const known = /^(ai\.|error\.ai)/.test(code) ? code.toUpperCase().replace(/\./g, '_') : ''
  return new PdfProviderError(known || code || 'PDF_AI_REQUEST_FAILED', status)
}

async function callPage(
  buffer: Buffer,
  pageId: string,
  target: PdfExtractTarget,
  instructions?: PdfExtractInstructions | null,
  event?: H3Event
): Promise<PdfExtractPage> {
  const { temperature } = config.pdf.extract

  const image = await renderPage(buffer)

  const result = await chatWithConnection({
    connectionId: target.connectionId,
    model: target.model,
    // The relay is text-only, so the schema and the operator's guidance all
    // travel inside the prompt.
    systemPrompt: buildSystemPrompt(instructions),
    messages: [{
      role: 'user',
      content: `${buildPagePrompt(pageId)}\n\nChỉ trả về JSON hợp lệ, không thêm giải thích hay khối markdown.`,
      attachments: [{ mimeType: 'image/png', data: image.toString('base64') }]
    }],
    // A dense price page easily needs a few thousand tokens; too small a budget
    // truncates the JSON and loses the tail of the page.
    maxTokens: maxOutputTokens(),
    temperature
  }, event)

  if (!result.content.trim()) throw new PdfProviderError('PDF_AI_EMPTY_RESPONSE')

  return parsePage(extractJson(result.content, result.usage), pageId)
}

async function callTextChunk(
  fileName: string,
  chunkId: string,
  text: string,
  target: PdfExtractTarget,
  instructions?: PdfExtractInstructions | null,
  event?: H3Event
): Promise<PdfExtractPage> {
  const { temperature } = config.pdf.extract

  const result = await chatWithConnection({
    connectionId: target.connectionId,
    model: target.model,
    systemPrompt: buildSystemPrompt(instructions),
    messages: [{
      role: 'user',
      content: `${buildTextChunkPrompt(fileName, chunkId, text)}\n\nChỉ trả về JSON hợp lệ, không thêm giải thích hay khối markdown.`
    }],
    maxTokens: maxOutputTokens(),
    temperature
  }, event)

  if (!result.content.trim()) throw new PdfProviderError('PDF_AI_EMPTY_RESPONSE')

  return parsePage(extractJson(result.content, result.usage), chunkId)
}

export async function extractPageWithRetry(
  buffer: Buffer,
  pageId: string,
  target: PdfExtractTarget,
  instructions?: PdfExtractInstructions | null,
  event?: H3Event
): Promise<PdfExtractPage> {
  const { maxRetries, retryDelayMs } = config.pdf.extract

  if (!target?.connectionId || !target?.model) {
    throw new PdfProviderError('PDF_AI_NO_MODEL', 503)
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= Math.max(1, maxRetries); attempt++) {
    try {
      return await callPage(buffer, pageId, target, instructions, event)
    } catch (error) {
      lastError = toProviderError(error)
      if (!isRetryable(lastError) || attempt >= maxRetries) break
      await delay(attempt * retryDelayMs)
    }
  }

  throw toProviderError(lastError)
}

/**
 * Word input goes through the text path: no page is rendered, so a price list
 * costs a fraction of the vision tokens and reads its tables exactly.
 */
export async function extractTextWithRetry(
  fileName: string,
  chunkId: string,
  text: string,
  target: PdfExtractTarget,
  instructions?: PdfExtractInstructions | null,
  event?: H3Event
): Promise<PdfExtractPage> {
  const { maxRetries, retryDelayMs } = config.pdf.extract

  if (!target?.connectionId || !target?.model) {
    throw new PdfProviderError('PDF_AI_NO_MODEL', 503)
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= Math.max(1, maxRetries); attempt++) {
    try {
      return await callTextChunk(fileName, chunkId, text, target, instructions, event)
    } catch (error) {
      lastError = toProviderError(error)
      if (!isRetryable(lastError) || attempt >= maxRetries) break
      await delay(attempt * retryDelayMs)
    }
  }

  throw toProviderError(lastError)
}
