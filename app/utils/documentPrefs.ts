/**
 * Remembers the last settings an operation was run with, per operation id.
 *
 * Extraction in particular asks for a model, a preset and a format set every
 * time; re-picking them on every visit is the friction this removes. Values are
 * stored as-is and merged over the caller's defaults, so a config field added in
 * a later release appears with its default instead of being absent.
 */

const PREFIX = 'document_studio:prefs'

export interface DocumentPrefs {
  config?: Record<string, unknown>
  concurrency?: number
  pauseMs?: number
  maxRetry?: number
}

function storageKey(operationId: string): string {
  return `${PREFIX}:${operationId}`
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    // A blocked storage (private mode, hardened browser) must not break the page.
    return null
  }
}

/** Saved config merged over `defaults`; always a fresh object. */
export function loadConfig<T extends Record<string, unknown>>(operationId: string, defaults: T): T {
  const store = storage()
  if (!store) return { ...defaults }
  try {
    const raw = store.getItem(storageKey(operationId))
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as DocumentPrefs
    const saved = parsed?.config
    if (!saved || typeof saved !== 'object') return { ...defaults }
    return { ...defaults, ...saved }
  } catch {
    return { ...defaults }
  }
}

export function loadBatchSettings(operationId: string): Pick<DocumentPrefs, 'concurrency' | 'pauseMs' | 'maxRetry'> {
  const store = storage()
  if (!store) return {}
  try {
    const raw = store.getItem(storageKey(operationId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as DocumentPrefs
    return {
      concurrency: typeof parsed?.concurrency === 'number' ? parsed.concurrency : undefined,
      pauseMs: typeof parsed?.pauseMs === 'number' ? parsed.pauseMs : undefined,
      maxRetry: typeof parsed?.maxRetry === 'number' ? parsed.maxRetry : undefined
    }
  } catch {
    return {}
  }
}

/** Read-modify-write so config and batch settings survive each other. */
export function savePrefs(operationId: string, patch: DocumentPrefs): void {
  const store = storage()
  if (!store) return
  try {
    const raw = store.getItem(storageKey(operationId))
    const current = raw ? (JSON.parse(raw) as DocumentPrefs) : {}
    const next: DocumentPrefs = { ...current }
    if (patch.config !== undefined) next.config = patch.config
    if (patch.concurrency !== undefined) next.concurrency = patch.concurrency
    if (patch.pauseMs !== undefined) next.pauseMs = patch.pauseMs
    if (patch.maxRetry !== undefined) next.maxRetry = patch.maxRetry
    store.setItem(storageKey(operationId), JSON.stringify(next))
  } catch {
    // Quota or serialisation failure: the run itself must still proceed.
  }
}

export function clearPrefs(operationId: string): void {
  storage()?.removeItem(storageKey(operationId))
}
