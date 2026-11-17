import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '#server/config'

export const MODEL_FILE = 'isnet-general-use.onnx'

/**
 * Same resolution as `resolveBundledTool`: an explicit env override first, then
 * the resources folder the desktop installer ships. An empty status means "not
 * installed"; callers report that instead of throwing a random fs error.
 */
export function modelPath(): string {
  const override = process.env.IMAGE_MODEL_PATH?.trim()
  if (override) return override
  return join(process.cwd(), 'resources', 'models', MODEL_FILE)
}

export function modelStatus(): { installed: boolean, path: string, bytes: number } {
  const path = modelPath()
  if (!existsSync(path)) return { installed: false, path, bytes: 0 }
  return { installed: true, path, bytes: statSync(path).size }
}

/** A truncated or substituted download must never reach the session. */
export function verifyModel(path: string, expectedSha256: string): boolean {
  if (!expectedSha256) return false
  if (!existsSync(path)) return false
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
  return actual === expectedSha256.toLowerCase()
}

export function expectedModelSha256(): string {
  return config.document.imageModelSha256
}
