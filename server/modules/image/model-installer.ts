import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'

/**
 * ISNet segmentation model install path.
 *
 * The model is ~178 MB, so it is not bundled (see electron-builder.yml). It is
 * downloaded on demand from the official rembg release into a writable data
 * directory (`TOOLS_DATA_DIR` under Electron, `.data` in dev, `/tmp` on a
 * serverless host) and verified against the release SHA-256 before use. A
 * truncated or substituted download never reaches the inference session.
 */

export const MODEL_FILE = 'isnet-general-use.onnx'
export const MODEL_VERSION = 'v0.0.0 (danielgatis/rembg)'
export const MODEL_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx'
/** SHA-256 of the official rembg v0.0.0 asset (178,648,008 bytes). */
export const MODEL_SHA256 = '60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a'
export const MODEL_BYTES = 178648008

function envValue(key: string): string {
  return String(process.env[key] ?? '').trim()
}

/** Mirrors config's resolveDataRoot: an Electron userData dir, else /tmp on the cloud, else .data. */
function dataRoot(): string {
  const override = envValue('TOOLS_DATA_DIR')
  if (override) return override
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return join(tmpdir(), 'tm-tools-data')
  return join(process.cwd(), '.data')
}

export function resolveModelPath(): string {
  const override = envValue('IMAGE_MODEL_PATH')
  if (override) return override
  return join(dataRoot(), 'models', MODEL_FILE)
}

export function resolveModelUrl(): string {
  return envValue('IMAGE_MODEL_URL') || MODEL_URL
}

/** Env override wins; otherwise the official release hash is the default. */
export function expectedModelSha256(): string {
  return envValue('IMAGE_MODEL_SHA256') || MODEL_SHA256
}

export function verifyModel(path: string, expectedSha256: string): boolean {
  if (!expectedSha256) return false
  if (!existsSync(path)) return false
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
  return actual === expectedSha256.toLowerCase()
}

export interface ModelStatus {
  installed: boolean
  verified: boolean
  path: string
  bytes: number
  expectedBytes: number
  sha256: string
  version: string
  url: string
}

export function modelStatus(): ModelStatus {
  const path = resolveModelPath()
  const sha256 = expectedModelSha256()
  const exists = existsSync(path)
  const bytes = exists ? statSync(path).size : 0
  return {
    installed: exists,
    verified: exists && verifyModel(path, sha256),
    path,
    bytes,
    expectedBytes: MODEL_BYTES,
    sha256,
    version: MODEL_VERSION,
    url: resolveModelUrl()
  }
}

export interface InstallModelOptions {
  targetPath?: string
  expectedSha256?: string
  url?: string
  onProgress?: (progress: { percent: number, receivedBytes: number, totalBytes: number }) => void
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export interface InstallModelResult {
  ok: true
  path: string
  bytes: number
}

/** One install at a time: a second click while 178 MB is in flight must not start a second download. */
let inFlight: Promise<InstallModelResult> | null = null
let lastProgress: { percent: number, receivedBytes: number, totalBytes: number } | null = null

export function installProgress(): typeof lastProgress {
  return lastProgress
}

export function isInstalling(): boolean {
  return inFlight !== null
}

export async function installModel(options: InstallModelOptions = {}): Promise<InstallModelResult> {
  if (inFlight) return inFlight
  inFlight = runInstall(options).finally(() => {
    inFlight = null
    lastProgress = null
  })
  return inFlight
}

async function runInstall(options: InstallModelOptions): Promise<InstallModelResult> {
  const targetPath = options.targetPath || resolveModelPath()
  const expectedSha256 = (options.expectedSha256 || expectedModelSha256()).toLowerCase()
  const url = options.url || resolveModelUrl()
  const fetchImpl = options.fetchImpl || fetch
  const partPath = `${targetPath}.part`

  mkdirSync(join(targetPath, '..'), { recursive: true })

  const response = await fetchImpl(url, { signal: options.signal, redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`MODEL_DOWNLOAD_FAILED: HTTP ${response.status}`)
  }

  const totalBytes = Number(response.headers.get('content-length') || 0)
  let receivedBytes = 0
  const sink = createWriteStream(partPath)

  try {
    const body = Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream)
    await new Promise<void>((resolve, reject) => {
      body.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length
        const percent = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0
        lastProgress = { percent, receivedBytes, totalBytes }
        options.onProgress?.(lastProgress)
      })
      body.on('error', reject)
      sink.on('error', reject)
      sink.on('finish', () => resolve())
      body.pipe(sink)
    })

    if (!verifyModel(partPath, expectedSha256)) {
      throw new Error('MODEL_HASH_MISMATCH')
    }

    renameSync(partPath, targetPath)
    return { ok: true, path: targetPath, bytes: receivedBytes }
  } catch (error) {
    // A failed install must never leave a partial file that looks installed.
    try {
      sink.destroy()
      rmSync(partPath, { force: true })
    } catch {
      // best effort
    }
    throw error
  }
}
