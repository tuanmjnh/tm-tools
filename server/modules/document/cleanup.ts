import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { documentDirs } from './paths'
import { cleanupJobWorkspace } from './temporary'

const DAY = 24 * 60 * 60 * 1000

interface ManifestShape {
  job?: { status?: string, expiresAt?: string }
}

/**
 * Startup janitor. It only removes job directories the repository already
 * considers inactive: a running job left over from a crash is reported, not
 * deleted, because its manifest is the only evidence of what happened.
 */
export function cleanupOrphans(options: { ttlMs?: number, now?: Date } = {}): { removed: string[], skipped: string[] } {
  const now = options.now ?? new Date()
  const ttl = options.ttlMs ?? DAY
  const removed: string[] = []
  const skipped: string[] = []

  if (!existsSync(documentDirs.jobs)) return { removed, skipped }

  for (const entry of readdirSync(documentDirs.jobs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestPath = join(documentDirs.jobs, entry.name, 'manifest.json')
    if (!existsSync(manifestPath)) {
      // A directory with no manifest is a half-written job. Only reclaim it once
      // it is older than the TTL, so an in-flight first request is not deleted.
      const age = now.getTime() - statSync(join(documentDirs.jobs, entry.name)).mtimeMs
      if (age > ttl) {
        const report = cleanupJobWorkspace(entry.name)
        if (report.failed.length) skipped.push(entry.name)
        else removed.push(entry.name)
      } else {
        skipped.push(entry.name)
      }
      continue
    }

    let manifest: ManifestShape
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestShape
    } catch {
      skipped.push(entry.name)
      continue
    }

    const status = manifest.job?.status ?? ''
    const active = status === 'running' || status === 'publishing' || status === 'queued' || status === 'uploading'
    if (active) {
      skipped.push(entry.name)
      continue
    }

    const expiresAt = manifest.job?.expiresAt ? new Date(manifest.job.expiresAt).getTime() : 0
    const expired = Number.isFinite(expiresAt) && expiresAt <= now.getTime()
    if (!expired) continue

    const report = cleanupJobWorkspace(entry.name)
    if (report.failed.length) skipped.push(entry.name)
    else removed.push(entry.name)
  }

  return { removed, skipped }
}
