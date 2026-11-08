import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PdfExtractJobState } from '#shared/types/pdf'
import { ensureDir, pdfDirs, writeFileAtomic } from '../paths'

/**
 * Extraction job journal.
 *
 * The v3 module kept every job in a `Map`, so a restart lost running state and
 * the Activity list. This keeps the same in-memory shape the engine already
 * uses, but writes each state change to disk so a restart can answer
 * `GET /pdf/extract/jobs` and `GET /pdf/extract/:id` again.
 *
 * A cloud deployment swaps `LocalExtractJobStore` for a repository over the same
 * database as `DocumentJobRepository`; the interface is deliberately the whole
 * surface the engine needs.
 */
export interface ExtractJobStore {
  save(state: PdfExtractJobState): void
  remove(id: string): void
  get(id: string): PdfExtractJobState | null
  list(): PdfExtractJobState[]
}

const MAX_PERSISTED = 50

function jobsDir(): string {
  return join(pdfDirs.system ?? join(pdfDirs.root, '.system'), 'extract-jobs')
}

function jobFile(id: string): string {
  // Job ids are UUIDs generated server-side; anything else cannot be a file name.
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new Error('PDF_JOB_NOT_FOUND')
  return join(jobsDir(), `${id}.json`)
}

export class LocalExtractJobStore implements ExtractJobStore {
  save(state: PdfExtractJobState): void {
    try {
      ensureDir(jobsDir())
      writeFileAtomic(jobFile(state.id), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      this.prune()
    } catch {
      // A full or read-only disk must not fail a running extraction.
    }
  }

  remove(id: string): void {
    try {
      const file = jobFile(id)
      if (existsSync(file)) writeFileAtomic(file, '')
    } catch {
      // Best effort: the in-memory map is already authoritative for this process.
    }
  }

  get(id: string): PdfExtractJobState | null {
    try {
      const file = jobFile(id)
      if (!existsSync(file)) return null
      return JSON.parse(readFileSync(file, 'utf8')) as PdfExtractJobState
    } catch {
      return null
    }
  }

  list(): PdfExtractJobState[] {
    if (!existsSync(jobsDir())) return []
    const states: PdfExtractJobState[] = []
    for (const entry of readdirSync(jobsDir()).filter(name => name.endsWith('.json'))) {
      try {
        const parsed = JSON.parse(readFileSync(join(jobsDir(), entry), 'utf8')) as PdfExtractJobState
        if (parsed?.id) states.push(parsed)
      } catch {
        // A truncated file is skipped; the job is simply missing from history.
      }
    }
    return states.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private prune(): void {
    const states = this.list()
    if (states.length <= MAX_PERSISTED) return
    for (const stale of states.slice(MAX_PERSISTED)) {
      if (stale.status === 'running' || stale.status === 'queued') continue
      try {
        writeFileAtomic(jobFile(stale.id), '')
      } catch {
        // Ignore: pruning is housekeeping.
      }
    }
  }
}

export const extractJobStore: ExtractJobStore = new LocalExtractJobStore()
