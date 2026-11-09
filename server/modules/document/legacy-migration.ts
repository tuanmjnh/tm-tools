import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, basename, dirname } from 'node:path'
import { pdfDirs, ensureDir } from '../pdf/paths'
import { documentDirs } from './paths'

export interface LegacyMigrationRecord {
  migrationVersion: string
  sourceArea: string
  sourceRelativePath: string
  sourceAbsolutePath: string
  destinationRole: 'input' | 'output' | 'system'
  destinationRelativePath: string
  destinationAbsolutePath: string
  originalName: string
  sizeBytes: number
  checksumSha256: string
  legacyReadOnly: boolean
  status: 'planned' | 'copied' | 'verified' | 'skipped' | 'failed'
  errorCode?: string
}

export interface MigrationSummary {
  version: string
  plannedCount: number
  copiedCount: number
  verifiedCount: number
  failedCount: number
  totalBytes: number
  records: LegacyMigrationRecord[]
}

const LEGACY_AREA_MAPPING: Record<string, { role: 'input' | 'output' | 'system', readOnly: boolean }> = {
  sources: { role: 'input', readOnly: false },
  inputs: { role: 'input', readOnly: false },
  word: { role: 'input', readOnly: true },
  split: { role: 'output', readOnly: false },
  images: { role: 'output', readOnly: false },
  merged: { role: 'output', readOnly: false },
  products: { role: 'output', readOnly: false },
  office: { role: 'output', readOnly: false },
  checkpoints: { role: 'system', readOnly: false }
}

function computeSha256(filePath: string): string {
  const buffer = readFileSync(filePath)
  return createHash('sha256').update(buffer).digest('hex')
}

function walkArea(dir: string, baseDir = dir): { absPath: string, relPath: string }[] {
  if (!existsSync(dir)) return []
  const files: { absPath: string, relPath: string }[] = []
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkArea(abs, baseDir))
    } else if (entry.isFile()) {
      files.push({ absPath: abs, relPath: relative(baseDir, abs).replace(/\\/g, '/') })
    }
  }
  return files
}

export function planMigration(version = 'v5.0.0'): LegacyMigrationRecord[] {
  const records: LegacyMigrationRecord[] = []

  for (const [area, meta] of Object.entries(LEGACY_AREA_MAPPING)) {
    const areaDir = (pdfDirs as Record<string, string>)[area]
    if (!areaDir || !existsSync(areaDir)) continue

    const files = walkArea(areaDir)
    for (const file of files) {
      try {
        const stats = statSync(file.absPath)
        const checksum = computeSha256(file.absPath)
        let destRoot: string
        let destRel: string

        if (meta.role === 'input') {
          destRoot = documentDirs.input
          destRel = file.relPath
        } else if (meta.role === 'output') {
          destRoot = documentDirs.output
          destRel = file.relPath
        } else {
          destRoot = join(documentDirs.system, 'checkpoints')
          destRel = file.relPath
        }

        records.push({
          migrationVersion: version,
          sourceArea: area,
          sourceRelativePath: file.relPath,
          sourceAbsolutePath: file.absPath,
          destinationRole: meta.role,
          destinationRelativePath: destRel,
          destinationAbsolutePath: join(destRoot, destRel),
          originalName: basename(file.absPath),
          sizeBytes: stats.size,
          checksumSha256: checksum,
          legacyReadOnly: meta.readOnly,
          status: 'planned'
        })
      } catch (err: any) {
        records.push({
          migrationVersion: version,
          sourceArea: area,
          sourceRelativePath: file.relPath,
          sourceAbsolutePath: file.absPath,
          destinationRole: meta.role,
          destinationRelativePath: file.relPath,
          destinationAbsolutePath: '',
          originalName: basename(file.absPath),
          sizeBytes: 0,
          checksumSha256: '',
          legacyReadOnly: meta.readOnly,
          status: 'failed',
          errorCode: err?.message || 'READ_ERROR'
        })
      }
    }
  }

  return records
}

export function executeMigration(records: LegacyMigrationRecord[], dryRun = true): MigrationSummary {
  const version = records[0]?.migrationVersion || 'v5.0.0'
  let plannedCount = 0
  let copiedCount = 0
  let verifiedCount = 0
  let failedCount = 0
  let totalBytes = 0

  for (const rec of records) {
    plannedCount++
    totalBytes += rec.sizeBytes

    if (dryRun) {
      continue
    }

    try {
      if (rec.status === 'failed') {
        failedCount++
        continue
      }

      // Check if already verified
      if (existsSync(rec.destinationAbsolutePath)) {
        const existingChecksum = computeSha256(rec.destinationAbsolutePath)
        if (existingChecksum === rec.checksumSha256) {
          rec.status = 'verified'
          verifiedCount++
          continue
        }
      }

      // Copy file
      mkdirSync(dirname(rec.destinationAbsolutePath), { recursive: true })
      copyFileSync(rec.sourceAbsolutePath, rec.destinationAbsolutePath)
      rec.status = 'copied'
      copiedCount++

      // Verify checksum
      const destChecksum = computeSha256(rec.destinationAbsolutePath)
      if (destChecksum === rec.checksumSha256) {
        rec.status = 'verified'
        verifiedCount++
      } else {
        rec.status = 'failed'
        rec.errorCode = 'CHECKSUM_MISMATCH'
        failedCount++
      }
    } catch (err: any) {
      rec.status = 'failed'
      rec.errorCode = err?.message || 'COPY_ERROR'
      failedCount++
    }
  }

  // Save report
  const planDir = join(documentDirs.system, 'migrations', version)
  ensureDir(planDir)
  const reportPath = join(planDir, dryRun ? 'dry-run-plan.json' : 'migration-report.json')
  const summary: MigrationSummary = {
    version,
    plannedCount,
    copiedCount,
    verifiedCount,
    failedCount,
    totalBytes,
    records
  }

  writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8')
  return summary
}
