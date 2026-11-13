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
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Renders the single-page PDF to PNG so the page can be sent to any vision
 * model: every provider accepts an image part, while only some accept a PDF.
 */
async function renderPage(buffer: Buffer): Promise<Buffer> {
  const document = await pdf(buffer, { scale: config.pdf.imageScale })
  try {
    if (document.length < 1) throw new PdfProviderError('PDF_AI_EMPTY_PAGE')
    return await document.getPage(1)
  } finally {
    await document.destroy()
  }
}

/** Models often wrap JSON in a fenced block or add prose around it. */
function extractJson(text: string): unknown {
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
  instructions?: PdfExtractInstructions | null
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
    maxTokens: 8192,
    temperature
  })

  if (!result.content.trim()) throw new PdfProviderError('PDF_AI_EMPTY_RESPONSE')

  return parsePage(extractJson(result.content), pageId)
}

async function callTextChunk(
  fileName: string,
  chunkId: string,
  text: string,
  target: PdfExtractTarget,
  instructions?: PdfExtractInstructions | null
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
    maxTokens: 8192,
    temperature
  })

  if (!result.content.trim()) throw new PdfProviderError('PDF_AI_EMPTY_RESPONSE')

  return parsePage(extractJson(result.content), chunkId)
}

export async function extractPageWithRetry(
  buffer: Buffer,
  pageId: string,
  target: PdfExtractTarget,
  instructions?: PdfExtractInstructions | null
): Promise<PdfExtractPage> {
  const { maxRetries, retryDelayMs } = config.pdf.extract

  if (!target?.connectionId || !target?.model) {
    throw new PdfProviderError('PDF_AI_NO_MODEL', 503)
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= Math.max(1, maxRetries); attempt++) {
    try {
      return await callPage(buffer, pageId, target, instructions)
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
  instructions?: PdfExtractInstructions | null
): Promise<PdfExtractPage> {
  const { maxRetries, retryDelayMs } = config.pdf.extract

  if (!target?.connectionId || !target?.model) {
    throw new PdfProviderError('PDF_AI_NO_MODEL', 503)
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= Math.max(1, maxRetries); attempt++) {
    try {
      return await callTextChunk(fileName, chunkId, text, target, instructions)
    } catch (error) {
      lastError = toProviderError(error)
      if (!isRetryable(lastError) || attempt >= maxRetries) break
      await delay(attempt * retryDelayMs)
    }
  }

  throw toProviderError(lastError)
}
