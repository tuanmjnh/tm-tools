import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensurePdfDirs, pdfDirs, writeFileAtomic } from './paths'

/** One recorded mutation. Never carries file bytes or credentials. */
export interface PdfAuditEvent {
  /** ISO timestamp, added by appendAudit. */
  at?: string
  /** upload | output | rename | delete | restore | purge | folder-create | repair | denied */
  action: string
  area?: string
  target?: string
  /** Where a rename moved the item to. */
  to?: string
  /** Extra context (byte size, tool name); never the payload itself. */
  bytes?: number
  tool?: string
  code?: string
}

const DEFAULT_LIMIT = 500

export function auditPath(): string {
  return join(pdfDirs.root, 'audit.jsonl')
}

function readLines(): PdfAuditEvent[] {
  const path = auditPath()
  if (!existsSync(path)) return []

  return readFileSync(path, 'utf8')
    .split('\n')
    .flatMap((line) => {
      if (!line.trim()) return []
      try {
        return [JSON.parse(line) as PdfAuditEvent]
      } catch {
        return []
      }
    })
}

/** Newest last. A corrupt line is skipped, never fatal. */
export function readAudit(limit = DEFAULT_LIMIT): PdfAuditEvent[] {
  const events = readLines()
  return limit >= events.length ? events : events.slice(-limit)
}

/**
 * Appends one event and trims the file back to `limit` events once it grows
 * past that, which keeps the log bounded without a timed cleanup job.
 */
export function appendAudit(event: PdfAuditEvent, options: { limit?: number } = {}): void {
  const limit = options.limit ?? DEFAULT_LIMIT
  ensurePdfDirs()

  const entry: PdfAuditEvent = { at: new Date().toISOString(), ...event }
  appendFileSync(auditPath(), `${JSON.stringify(entry)}\n`, 'utf8')

  if (limit <= 0) return

  const events = readLines()
  if (events.length > limit) {
    const kept = events.slice(-limit).map(item => `${JSON.stringify(item)}\n`).join('')
    writeFileAtomic(auditPath(), kept, 'utf8')
  }
}

/** Audit must never break the operation it records. */
export function recordAudit(event: PdfAuditEvent): void {
  try {
    appendAudit(event)
  } catch {
    // Swallowed on purpose: a full or locked log must not fail a user action.
  }
}
