import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PdfExtractPreset } from '#shared/types/pdf'
import { ensureDir, pdfDirs } from '../paths'

/**
 * Guidance a run can carry besides the chosen model. Only the descriptive
 * parts matter to the model; `preset` is the label stored on the job.
 */
export interface PdfExtractInstructions {
  preset?: string
  description?: string
  sample?: string
}

const MAX_PRESETS = 40
/** Keep prompts inside the relay's payload budget. */
const LIMITS = { name: 80, description: 6000, sample: 16000 } as const

function presetsFile(): string {
  return join(pdfDirs.root, 'presets.json')
}

function clamp(value: unknown, max: number): string {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function readAll(): PdfExtractPreset[] {
  const file = presetsFile()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is PdfExtractPreset => Boolean(entry) && typeof entry.id === 'string')
      .map(entry => ({
        id: entry.id,
        name: clamp(entry.name, LIMITS.name) || entry.id,
        description: clamp(entry.description, LIMITS.description),
        sample: clamp(entry.sample, LIMITS.sample),
        updatedAt: String(entry.updatedAt ?? '')
      }))
  } catch {
    // A corrupt file must not break extraction: treat it as "no presets".
    return []
  }
}

function writeAll(presets: PdfExtractPreset[]): void {
  ensureDir(pdfDirs.root)
  writeFileSync(presetsFile(), `${JSON.stringify(presets, null, 2)}\n`, 'utf8')
}

export function listPresets(): PdfExtractPreset[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * Creates a preset, or updates one when `id` is given. Storage is a plain JSON
 * file next to the PDFs so presets survive restarts without a migration.
 */
export function savePreset(input: {
  id?: unknown
  name?: unknown
  description?: unknown
  sample?: unknown
}): PdfExtractPreset {
  const name = clamp(input.name, LIMITS.name)
  if (!name) throw new Error('PDF_PRESET_NAME_REQUIRED')

  const presets = readAll()
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const existing = id ? presets.find(entry => entry.id === id) : undefined

  const preset: PdfExtractPreset = {
    id: existing?.id ?? (id || randomUUID()),
    name,
    description: clamp(input.description, LIMITS.description),
    sample: clamp(input.sample, LIMITS.sample),
    updatedAt: new Date().toISOString()
  }

  const next = existing
    ? presets.map(entry => (entry.id === existing.id ? preset : entry))
    : [...presets, preset]

  if (next.length > MAX_PRESETS) throw new Error('PDF_PRESET_LIMIT')
  writeAll(next)
  return preset
}

export function deletePreset(id: string): boolean {
  const presets = readAll()
  const next = presets.filter(entry => entry.id !== id)
  if (next.length === presets.length) return false
  writeAll(next)
  return true
}

/** Normalises what the start endpoint received before it reaches the prompt. */
export function sanitizeInstructions(raw: unknown): PdfExtractInstructions | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const instructions: PdfExtractInstructions = {
    preset: clamp(record.preset, LIMITS.name) || undefined,
    description: clamp(record.description, LIMITS.description) || undefined,
    sample: clamp(record.sample, LIMITS.sample) || undefined
  }
  return instructions.description || instructions.sample ? instructions : null
}
