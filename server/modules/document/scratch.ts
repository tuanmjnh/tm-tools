import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CleanupReport, TempJobWorkspace, TempUsage, TemporaryWorkspace } from './contracts'
import { DocumentError } from './operations'
import { policyFor } from './runtime'
import { assertJobId } from './temporary'

/**
 * Cloud scratch. Vercel only guarantees `/tmp` for the life of one invocation,
 * so the directory name is random (`mkdtemp`) and never derived from user input,
 * and nothing outside this invocation may read it. Job state lives in Postgres,
 * not here.
 */
function scratchRoot(): string {
  const base = join(tmpdir(), 'tm-document-studio')
  mkdirSync(base, { recursive: true })
  return base
}

function jobSlug(jobId: string): string {
  return createHash('sha256').update(jobId).digest('hex').slice(0, 24)
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

class ScratchJobWorkspace implements TempJobWorkspace {
  constructor(readonly jobId: string, readonly root: string) {}

  get inputDir(): string {
    return join(this.root, 'input')
  }

  get workingDir(): string {
    return join(this.root, 'working')
  }

  get outputDir(): string {
    return join(this.root, 'output')
  }

  async cleanup(): Promise<CleanupReport> {
    return removeScratch(this.jobId, this.root)
  }
}

async function removeScratch(jobId: string, root: string): Promise<CleanupReport> {
  const usage = directoryBytes(root)
  if (!existsSync(root)) return { jobId, removedBytes: 0, removedEntries: 0, failed: [] }
  try {
    await rm(root, { recursive: true, force: true })
    return { jobId, removedBytes: usage.bytes, removedEntries: usage.files, failed: [] }
  } catch {
    return { jobId, removedBytes: 0, removedEntries: 0, failed: [root] }
  }
}

/** The scratch dirs created by this invocation, so `finally` can drop them. */
const live = new Map<string, ScratchJobWorkspace>()

export class CloudTemporaryWorkspace implements TemporaryWorkspace {
  async create(jobId: string): Promise<TempJobWorkspace> {
    assertJobId(jobId)
    const root = mkdtempSync(join(scratchRoot(), `${jobSlug(jobId)}-`))
    const workspace = new ScratchJobWorkspace(jobId, root)
    for (const dir of [workspace.inputDir, workspace.workingDir, workspace.outputDir]) {
      mkdirSync(dir, { recursive: true })
    }
    live.set(jobId, workspace)
    return workspace
  }

  async cleanup(jobId: string): Promise<CleanupReport> {
    const workspace = live.get(jobId)
    live.delete(jobId)
    if (workspace) return removeScratch(jobId, workspace.root)
    // A different invocation created the directory; nothing local to free.
    return { jobId, removedBytes: 0, removedEntries: 0, failed: [] }
  }

  async releaseStaging(jobId: string): Promise<CleanupReport> {
    const workspace = live.get(jobId)
    if (!workspace) return { jobId, removedBytes: 0, removedEntries: 0, failed: [] }
    let removedBytes = 0
    let removedEntries = 0
    const failed: string[] = []
    for (const dir of [workspace.inputDir, workspace.workingDir]) {
      const usage = directoryBytes(dir)
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

  async getUsage(jobId: string): Promise<TempUsage> {
    const workspace = live.get(jobId)
    const usage = workspace ? directoryBytes(workspace.root) : { bytes: 0, files: 0 }
    return {
      jobId,
      bytes: usage.bytes,
      limitBytes: this.limitBytes(),
      files: usage.files
    }
  }

  async ensureCapacity(jobId: string, expectedBytes: number): Promise<void> {
    const usage = await this.getUsage(jobId)
    const limit = this.limitBytes()
    if (usage.bytes + expectedBytes > limit) {
      throw new DocumentError('DOCUMENT_TEMP_CAPACITY_EXCEEDED', {
        used: usage.bytes,
        requested: expectedBytes,
        limit
      })
    }
  }

  /** No cross-invocation scratch exists to sweep, so the cloud has no orphans. */
  async listOrphans(): Promise<string[]> {
    return []
  }

  private limitBytes(): number {
    return policyFor().maxTempBytes
  }
}

export const cloudTemporaryWorkspace = new CloudTemporaryWorkspace()
