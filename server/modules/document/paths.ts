import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { config } from '#server/config'

/**
 * v4 layout, rooted at the same configured PDF root so nothing moves:
 *
 *   <root>/input/            optional reusable input library
 *   <root>/output/           default persistent output folder
 *   <root>/.system/jobs/     per-job temp + manifest
 *
 * The v3 areas (sources, split, images, merged, products, office, word,
 * checkpoints, .trash) stay exactly where they are for the compatibility period.
 */
export const documentRoot = config.pdf.dir

export const documentDirs = {
  root: documentRoot,
  input: join(documentRoot, 'input'),
  output: join(documentRoot, 'output'),
  system: join(documentRoot, '.system'),
  jobs: join(documentRoot, '.system', 'jobs'),
  logs: join(documentRoot, '.system', 'logs')
} as const

export function ensureDocumentDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function ensureDocumentDirs(): void {
  Object.values(documentDirs).forEach(ensureDocumentDir)
}

export function jobRoot(jobId: string): string {
  return join(documentDirs.jobs, jobId)
}

export function jobInputDir(jobId: string): string {
  return join(jobRoot(jobId), 'input')
}

export function jobWorkingDir(jobId: string): string {
  return join(jobRoot(jobId), 'working')
}

export function jobOutputDir(jobId: string): string {
  return join(jobRoot(jobId), 'output')
}

export function jobManifestPath(jobId: string): string {
  return join(jobRoot(jobId), 'manifest.json')
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

/**
 * A job id arrives from the URL, so every filesystem entry point resolves the
 * real path first and refuses anything that leaves the jobs directory — a
 * junction named like a job id must not redirect writes elsewhere.
 */
export function assertInsideJobs(jobId: string, target: string): string {
  const root = realpathOrSelf(documentDirs.jobs)
  let current = target
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  const real = realpathOrSelf(current)
  const rel = relative(root, real)
  if (rel === '') return target
  if (rel.startsWith('..') || rel.startsWith(sep) || /^[a-zA-Z]:/.test(rel)) {
    throw new Error('DOCUMENT_JOB_NOT_FOUND')
  }
  return target
}
