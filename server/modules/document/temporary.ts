import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type {
  CleanupReport,
  TempJobWorkspace,
  TempUsage,
  TemporaryWorkspace
} from './contracts'
import { DocumentError } from './operations'
import { assertInsideJobs, documentDirs, ensureDocumentDirs, jobInputDir, jobOutputDir, jobRoot, jobWorkingDir } from './paths'
import { runtimeCapabilities } from './runtime'

/** `jobId` is URL-reachable, so it is validated before it ever becomes a path segment. */
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export function assertJobId(jobId: string): string {
  if (!JOB_ID_PATTERN.test(jobId)) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
  return jobId
}

function directoryBytes(dir: string): { bytes: number, files: number } {
  if (!existsSync(dir)) return { bytes: 0, files: 0 }
  let bytes = 0
  let files = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = directoryBytes(full)
      bytes += nested.bytes
      files += nested.files
    } else if (entry.isFile()) {
      bytes += statSync(full).size
      files++
    }
  }
  return { bytes, files }
}

class LocalTempJobWorkspace implements TempJobWorkspace {
  constructor(readonly jobId: string) {}

  get root(): string {
    return jobRoot(this.jobId)
  }

  get inputDir(): string {
    return jobInputDir(this.jobId)
  }

  get workingDir(): string {
    return jobWorkingDir(this.jobId)
  }

  get outputDir(): string {
    return jobOutputDir(this.jobId)
  }

  async cleanup(): Promise<CleanupReport> {
    return cleanupJobWorkspace(this.jobId)
  }
}

/**
 * Deletes one job directory. `assertInsideJobs` runs first so a request-supplied
 * id that resolves through a link outside `.system/jobs` cannot delete a real
 * user directory.
 */
export function cleanupJobWorkspace(jobId: string): CleanupReport {
  assertJobId(jobId)
  const root = assertInsideJobs(jobId, jobRoot(jobId))
  return removeDirs(jobId, [root])
}

function removeDirs(jobId: string, dirs: string[]): CleanupReport {
  let removedBytes = 0
  let removedEntries = 0
  const failed: string[] = []

  for (const dir of dirs) {
    assertInsideJobs(jobId, dir)
    const usage = directoryBytes(dir)
    if (!existsSync(dir)) continue
    try {
      rmSync(dir, { recursive: true, force: true })
      removedBytes += usage.bytes
      removedEntries += usage.files
    } catch {
      failed.push(dir)
    }
  }

  return { jobId, removedBytes, removedEntries, failed }
}

export class LocalTemporaryWorkspace implements TemporaryWorkspace {
  async create(jobId: string): Promise<TempJobWorkspace> {
    assertJobId(jobId)
    ensureDocumentDirs()
    const workspace = new LocalTempJobWorkspace(jobId)
    for (const dir of [workspace.root, workspace.inputDir, workspace.workingDir, workspace.outputDir]) {
      assertInsideJobs(jobId, dir)
      mkdirSync(dir, { recursive: true })
    }
    return workspace
  }

  async cleanup(jobId: string): Promise<CleanupReport> {
    return cleanupJobWorkspace(jobId)
  }

  async releaseStaging(jobId: string): Promise<CleanupReport> {
    assertJobId(jobId)
    return removeDirs(jobId, [jobInputDir(jobId), jobWorkingDir(jobId)])
  }

  async getUsage(jobId: string): Promise<TempUsage> {
    assertJobId(jobId)
    const usage = directoryBytes(jobRoot(jobId))
    return {
      jobId,
      bytes: usage.bytes,
      limitBytes: runtimeCapabilities().maxTempBytes,
      files: usage.files
    }
  }

  /** Budget covers input + intermediate + output together, per §24. */
  async ensureCapacity(jobId: string, expectedBytes: number): Promise<void> {
    const usage = await this.getUsage(jobId)
    if (usage.bytes + expectedBytes > usage.limitBytes) {
      throw new DocumentError('DOCUMENT_TEMP_CAPACITY_EXCEEDED', {
        used: usage.bytes,
        requested: expectedBytes,
        limit: usage.limitBytes
      })
    }
  }

  async listOrphans(before: Date): Promise<string[]> {
    ensureDocumentDirs()
    const cutoff = before.getTime()
    return readdirSync(documentDirs.jobs, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && JOB_ID_PATTERN.test(entry.name))
      .filter((entry) => {
        try {
          return statSync(join(documentDirs.jobs, entry.name)).mtimeMs < cutoff
        } catch {
          return false
        }
      })
      .map(entry => entry.name)
  }
}

export const localTemporaryWorkspace = new LocalTemporaryWorkspace()
