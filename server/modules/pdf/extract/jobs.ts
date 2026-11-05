import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  PdfExportRow,
  PdfExtractJobState,
  PdfExtractJobSummary,
  PdfExtractPage
} from '#shared/types/pdf'
import { config } from '#server/config'
import { recordAudit } from '../audit'
import { pageFileName, splitPdf } from '../document'
import { anySourcePath, splitDirName } from '../library'
import { docxToText } from '../office/docxParse'
import { ensureDir, pdfDirs, writeFileAtomic } from '../paths'
import { naturalCompare, safeRelativePath, safeStem } from '../security'
import { hasProductFiles, writeProducts } from './export'
import { normalizeTo25Columns } from './normalize'
import { extractPageWithRetry, extractTextWithRetry } from './provider'
import { resolveExtractTarget, type PdfExtractTarget } from './models'
import type { PdfExtractInstructions } from './presets'

interface JobEntry {
  state: PdfExtractJobState
  rows: PdfExportRow[]
  pages: PdfExtractPage[]
  /** Preset guidance captured when the job was started. */
  instructions: PdfExtractInstructions | null
}

/** One unit of work: a PDF page, or a text chunk of a Word document. */
interface WorkUnit {
  id: string
  extract: () => Promise<PdfExtractPage>
}

const MAX_JOBS = 20
const PREVIEW_LIMIT = 200
/** Roughly 3.5k tokens of Vietnamese per chunk, small enough to stay JSON-safe. */
const WORD_CHUNK_CHARS = 12_000

const jobs = new Map<string, JobEntry>()

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function pruneJobs(): void {
  if (jobs.size <= MAX_JOBS) return

  const finished = [...jobs.entries()]
    .filter(([, entry]) => entry.state.status !== 'running' && entry.state.status !== 'queued')
    .sort((a, b) => a[1].state.createdAt.localeCompare(b[1].state.createdAt))

  while (jobs.size > MAX_JOBS && finished.length > 0) {
    const oldest = finished.shift()
    if (oldest) jobs.delete(oldest[0])
  }
}

export function listJobs(): PdfExtractJobState[] {
  return [...jobs.values()]
    .map(entry => ({ ...entry.state }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getJob(id: string): PdfExtractJobSummary | null {
  const entry = jobs.get(id)
  if (!entry) return null

  return {
    ...entry.state,
    available: entry.rows.length > 0,
    rows: entry.rows.slice(0, PREVIEW_LIMIT)
  }
}

export function cancelJob(id: string): boolean {
  const entry = jobs.get(id)
  if (!entry || entry.state.status !== 'running') return false
  entry.state.cancelRequested = true
  return true
}

/**
 * Reads the per-page checkpoints a source already produced, so the export
 * workspace can regenerate table formats without paying for another AI run.
 */
export function readCachedRows(rawSource: string): PdfExportRow[] {
  const stem = splitDirName(rawSource)
  const dir = join(pdfDirs.checkpoints, stem)
  if (!existsSync(dir)) return []

  const pages = readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort(naturalCompare)
    .flatMap((file) => {
      try {
        return [JSON.parse(readFileSync(join(dir, file), 'utf8')) as PdfExtractPage]
      } catch {
        return []
      }
    })

  return pages.length ? normalizeTo25Columns(pages) : []
}

export function productsFilePath(rawSource: string, rawFormat: string): { path: string, name: string } {
  const format = ['json', 'csv', 'xlsx', 'docx'].includes(rawFormat) ? rawFormat : 'csv'
  const stem = safeStem(rawSource)
  const name = `${stem}_products.${format}`
  const path = join(pdfDirs.products, name)

  if (!existsSync(path)) {
    throw new Error('PDF_RESULT_NOT_FOUND')
  }
  return { path, name }
}

export async function startExtraction(
  rawSource: string,
  force = false,
  requested?: Partial<PdfExtractTarget> | null,
  instructions?: PdfExtractInstructions | null,
  overwrite = true
): Promise<PdfExtractJobState> {
  const source = safeRelativePath(rawSource)
  anySourcePath(source)

  if (!overwrite && hasProductFiles(pdfDirs.products, `${splitDirName(source)}_products`)) {
    throw new Error('PDF_FILE_ALREADY_EXISTS')
  }

  // The picker sends a live catalogue entry; anything else falls back to the
  // suggested model, so there is no model allowlist to keep in sync here.
  const target = await resolveExtractTarget(requested)

  const running = [...jobs.values()].find(entry => entry.state.status === 'running')
  if (running) {
    throw new Error('PDF_JOB_RUNNING')
  }

  const state: PdfExtractJobState = {
    id: randomUUID(),
    status: 'queued',
    source,
    model: target.model,
    connectionId: target.connectionId,
    preset: instructions?.preset ?? null,
    totalPages: 0,
    processedPages: 0,
    cachedPages: 0,
    failedPages: [],
    currentPage: null,
    productCount: 0,
    rowCount: 0,
    error: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    cancelRequested: false
  }

  const entry: JobEntry = { state, rows: [], pages: [], instructions: instructions ?? null }
  jobs.set(state.id, entry)
  pruneJobs()

  void runJob(entry, force, target)

  return { ...state }
}

function checkpointPath(stem: string, page: string): string {
  return join(pdfDirs.checkpoints, stem, `${page}.json`)
}

/**
 * Word text is split on paragraph boundaries so a chunk never starts mid-row;
 * only a single oversized paragraph is hard-broken.
 */
export function chunkWordText(text: string, size = WORD_CHUNK_CHARS): string[] {
  const paragraphs = text.split(/\n/)
  const chunks: string[] = []
  let current = ''

  const push = () => {
    if (current.trim()) chunks.push(current)
    current = ''
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > size) {
      push()
      for (let index = 0; index < paragraph.length; index += size) {
        chunks.push(paragraph.slice(index, index + size))
      }
      continue
    }

    if (current.length + paragraph.length + 1 > size) push()
    current += `${paragraph}\n`
  }

  push()
  return chunks.length ? chunks : [text]
}

async function buildUnits(
  entry: JobEntry,
  sourceFile: string,
  kind: 'pdf' | 'word',
  target: PdfExtractTarget,
  stem: string
): Promise<WorkUnit[]> {
  if (kind === 'word') {
    const text = await docxToText(readFileSync(sourceFile))
    const chunks = chunkWordText(text)
    return chunks.map((chunk, index) => {
      const chunkId = `text_${String(index + 1).padStart(config.pdf.padLength, '0')}`
      return {
        id: chunkId,
        extract: () => extractTextWithRetry(entry.state.source, chunkId, chunk, target, entry.instructions)
      }
    })
  }

  const splitDir = join(pdfDirs.split, stem)
  const { totalPages } = await splitPdf(sourceFile, splitDir)

  return Array.from({ length: totalPages }, (_, index) => {
    const pageId = pageFileName(index + 1)
    return {
      id: pageId,
      extract: () => extractPageWithRetry(
        readFileSync(join(splitDir, `${pageId}.pdf`)),
        pageId,
        target,
        entry.instructions
      )
    }
  })
}

async function runJob(entry: JobEntry, force: boolean, target: PdfExtractTarget): Promise<void> {
  const stem = splitDirName(entry.state.source)

  try {
    entry.state.status = 'running'
    const resolved = anySourcePath(entry.state.source)
    ensureDir(join(pdfDirs.checkpoints, stem))

    const units = await buildUnits(entry, resolved.path, resolved.kind, target, stem)
    entry.state.totalPages = units.length

    for (const [index, unit] of units.entries()) {
      if (entry.state.cancelRequested) break

      const cachedFile = checkpointPath(stem, unit.id)

      if (!force && existsSync(cachedFile)) {
        const cached = JSON.parse(readFileSync(cachedFile, 'utf8')) as PdfExtractPage
        entry.pages.push(cached)
        entry.state.cachedPages++
        // Cached pages still count towards the totals, otherwise a resumed run
        // reports zero products.
        entry.state.productCount += cached.products?.length ?? 0
        continue
      }

      entry.state.currentPage = unit.id

      try {
        const data = await unit.extract()
        writeFileAtomic(cachedFile, JSON.stringify(data, null, 2), 'utf8')
        entry.pages.push(data)
        entry.state.productCount += data.products.length
      } catch (error) {
        const code = (error as Error)?.message || 'PDF_AI_REQUEST_FAILED'
        entry.state.failedPages.push(unit.id)
        entry.state.error = code
        // No usable model/connection: every remaining unit would fail the same way.
        if (code === 'PDF_AI_NO_MODEL') break
      }

      entry.state.processedPages++
      entry.state.currentPage = null

      if (index < units.length - 1 && !entry.state.cancelRequested) {
        await delay(config.pdf.extract.pageDelayMs)
      }
    }

    entry.rows = normalizeTo25Columns(entry.pages)
    entry.state.rowCount = entry.rows.length
    await writeProducts(pdfDirs.products, `${stem}_products`, entry.rows)
    recordAudit({ action: 'output', area: 'products', target: `${stem}_products`, tool: 'extract' })

    if (entry.state.cancelRequested) {
      entry.state.status = 'cancelled'
    } else if (entry.state.failedPages.length > 0) {
      entry.state.status = 'failed'
    } else {
      entry.state.status = 'done'
    }
  } catch (error) {
    entry.state.status = 'failed'
    entry.state.error = (error as Error)?.message || 'PDF_EXTRACT_FAILED'
  } finally {
    entry.state.currentPage = null
    entry.state.finishedAt = new Date().toISOString()
  }
}
