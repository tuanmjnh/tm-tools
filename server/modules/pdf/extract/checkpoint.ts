import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDF_EXTRACT_CHECKPOINT_VERSION } from '#shared/types/pdf'
import { pdfDirs } from '../paths'
import { productExtractionSchema } from './schema'
import { buildSystemPrompt } from './prompt'
import type { PdfExtractInstructions } from './presets'
import type { PdfExtractTarget } from './models'

/**
 * Checkpoint identity. Reusing a page checkpoint because the *file name* matched
 * is how a changed preset or a new model silently serves stale rows, so the key
 * mixes every input that can change the answer (completion guide §7.4).
 *
 * Everything in the hash is a stable descriptor plus a SHA-256 of the source
 * bytes — never the document content itself.
 */
export interface CheckpointFingerprintInput {
  sourcePath: string
  totalPages: number
  target: PdfExtractTarget
  instructions?: PdfExtractInstructions | null
}

export interface CheckpointFingerprint {
  /** Full hash — used to decide reuse. */
  key: string
  /** First 16 hex chars — used in the directory name. */
  short: string
  parts: {
    source: string
    pages: number
    schema: string
    prompt: string
    model: string
    connection: string
    preset: string
    checkpointVersion: number
  }
}

function stableHash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Deterministic JSON: key order must not change the hash. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
}

export function sourceHash(sourcePath: string): string {
  return stableHash(readFileSync(sourcePath))
}

/** The prompt is part of the contract: editing it must invalidate old rows. */
export function promptVersion(instructions?: PdfExtractInstructions | null): string {
  return stableHash(buildSystemPrompt(instructions ?? null)).slice(0, 16)
}

export function presetFingerprint(instructions?: PdfExtractInstructions | null): string {
  return stableHash(canonical({
    preset: instructions?.preset ?? '',
    description: instructions?.description ?? '',
    sample: instructions?.sample ?? ''
  })).slice(0, 16)
}

export function checkpointFingerprint(input: CheckpointFingerprintInput): CheckpointFingerprint {
  const parts = {
    source: sourceHash(input.sourcePath),
    pages: input.totalPages,
    schema: stableHash(canonical(productExtractionSchema)).slice(0, 16),
    prompt: promptVersion(input.instructions),
    model: input.target.model,
    connection: input.target.connectionId,
    preset: presetFingerprint(input.instructions),
    checkpointVersion: PDF_EXTRACT_CHECKPOINT_VERSION
  }
  const key = stableHash(canonical(parts))
  return { key, short: key.slice(0, 16), parts }
}

/**
 * `checkpoints/<stem>/v<version>-<short>/`. The legacy per-stem directory is
 * left alone so a run started on the old layout still finishes.
 */
export function fingerprintDir(stem: string, fingerprint: CheckpointFingerprint): string {
  return join(pdfDirs.checkpoints, stem, `v${PDF_EXTRACT_CHECKPOINT_VERSION}-${fingerprint.short}`)
}
