/**
 * Extraction presets travel as JSON so one device's rules can reach another
 * without a migration. The server owns ids and `updatedAt`; this module only
 * normalizes what a file claims and decides what a merge would add.
 */

export interface PresetTransferEntry {
  id?: string
  name: string
  description?: string
  sample?: string
}

export type PresetParseResult
  = | { ok: true, entries: PresetTransferEntry[], skipped: number }
    | { ok: false, error: 'not-json' | 'invalid-shape' | 'empty' }

export const PRESET_TRANSFER_VERSION = 1
export const PRESET_MAX_COUNT = 40

const LIMITS = { name: 80, description: 6000, sample: 16000 } as const

function clamp(value: unknown, max: number): string {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function normalizeEntry(raw: unknown): PresetTransferEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const name = clamp(record.name, LIMITS.name)
  if (!name) return null
  const entry: PresetTransferEntry = { name }
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (id) entry.id = id
  const description = clamp(record.description, LIMITS.description)
  if (description) entry.description = description
  const sample = clamp(record.sample, LIMITS.sample)
  if (sample) entry.sample = sample
  return entry
}

export function parsePresetFile(text: string): PresetParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'not-json' }
  }

  let candidates: unknown[]
  if (Array.isArray(parsed)) {
    candidates = parsed
  } else if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>
    if (Array.isArray(record.presets)) candidates = record.presets
    else if (typeof record.name === 'string') candidates = [record]
    else return { ok: false, error: 'invalid-shape' }
  } else {
    return { ok: false, error: 'invalid-shape' }
  }

  const entries: PresetTransferEntry[] = []
  let skipped = 0
  for (const candidate of candidates) {
    const entry = normalizeEntry(candidate)
    if (entry) entries.push(entry)
    else skipped++
  }
  if (!entries.length) return { ok: false, error: 'empty' }
  return { ok: true, entries, skipped }
}

export function serializePresetFile(
  entries: PresetTransferEntry[],
  exportedAt: string = new Date().toISOString()
): string {
  const presets = entries.map(entry => ({
    id: entry.id,
    name: entry.name,
    description: entry.description ?? '',
    sample: entry.sample ?? ''
  }))
  return `${JSON.stringify({ version: PRESET_TRANSFER_VERSION, exportedAt, presets }, null, 2)}\n`
}

export interface PresetMergePlan {
  added: PresetTransferEntry[]
  skipped: number
  overflow: number
}

/** An id already on this device is left alone; the import never overwrites. */
export function mergePresets(
  existing: { id: string }[],
  incoming: PresetTransferEntry[],
  limit: number = PRESET_MAX_COUNT
): PresetMergePlan {
  const taken = new Set(existing.map(entry => entry.id))
  let skipped = 0
  const fresh: PresetTransferEntry[] = []
  for (const entry of incoming) {
    if (entry.id && taken.has(entry.id)) {
      skipped++
      continue
    }
    fresh.push(entry)
  }
  const room = Math.max(0, limit - existing.length)
  return {
    added: fresh.slice(0, room),
    skipped,
    overflow: Math.max(0, fresh.length - room)
  }
}

/** File-system safe, ASCII-only, so the name survives any OS or download folder. */
export function presetFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `extraction-preset-${slug}.json` : 'extraction-preset.json'
}
