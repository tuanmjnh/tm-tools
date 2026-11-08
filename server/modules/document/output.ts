import { copyFileSync, createReadStream, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DocumentArtifactRecord } from '#shared/types/document'
import type { DocumentStorageProvider, OutputDeliveryAdapter, PublishedObject } from './contracts'
import { DocumentError } from './operations'
import { documentDirs, ensureDocumentDir } from './paths'
import { safeFileName } from '../pdf/security'

/**
 * Local delivery copies the finished artifact into the persistent `output/`
 * folder. Name collisions get a numeric suffix instead of overwriting, because
 * `ask` cannot be answered after the fact: the API answers `ask` before the run
 * starts and only reaches here once the user picked `rename`.
 */
export class LocalOutputDelivery implements OutputDeliveryAdapter {
  readonly mode = 'folder' as const

  async publish(artifact: DocumentArtifactRecord, localPath: string): Promise<PublishedObject> {
    if (!existsSync(localPath)) throw new DocumentError('DOCUMENT_OUTPUT_NOT_READY')
    const folder = ensureDocumentDir(documentDirs.output)
    const target = uniqueTarget(folder, artifact.fileName)
    copyFileSync(localPath, target)
    return {
      storageProvider: 'local',
      storageKey: artifact.storageKey,
      size: statSync(target).size,
      localPath: target
    }
  }

  async remove(artifact: DocumentArtifactRecord): Promise<void> {
    // The published copy is user data; deleting a job never removes it.
    void artifact
  }
}

let counter = 0

function uniqueTarget(baseFolder: string, relativeOrBaseName: string): string {
  // If the artifact relative path has subdirectories (e.g. "my-doc/page_0001.pdf"),
  // preserve and ensure the destination subfolder exists.
  const cleanRelative = relativeOrBaseName.replace(/\\/g, '/').replace(/^\/+/, '')
  const lastSlash = cleanRelative.lastIndexOf('/')
  const targetFolder = lastSlash >= 0 ? ensureDocumentDir(join(baseFolder, cleanRelative.slice(0, lastSlash))) : baseFolder
  const fileName = lastSlash >= 0 ? cleanRelative.slice(lastSlash + 1) : cleanRelative

  const stem = fileName.replace(/\.[^.]+$/, '')
  const ext = fileName.slice(stem.length)
  let candidate = join(targetFolder, fileName)
  let index = 1
  while (existsSync(candidate)) {
    candidate = join(targetFolder, `${stem} (${index})${ext}`)
    index++
    if (index > 999) {
      counter++
      candidate = join(targetFolder, `${stem} (${Date.now()}-${counter})${ext}`)
      break
    }
  }
  return candidate
}

/**
 * Ephemeral delivery: there is no bucket and no persistent folder, so the file
 * the executor wrote inside the job workspace IS the artifact. Copying it into
 * a shared `output/` would only collide across users on the same `/tmp`.
 */
export class EphemeralOutputDelivery implements OutputDeliveryAdapter {
  readonly mode = 'download' as const

  async publish(artifact: DocumentArtifactRecord, localPath: string): Promise<PublishedObject> {
    if (!existsSync(localPath)) throw new DocumentError('DOCUMENT_OUTPUT_NOT_READY')
    return {
      storageProvider: 'local',
      storageKey: artifact.storageKey,
      size: statSync(localPath).size
    }
  }

  async remove(artifact: DocumentArtifactRecord): Promise<void> {
    void artifact
  }
}

/**
 * Cloud delivery uploads the artifact into the private bucket and returns the
 * object reference. Nothing is copied to a user-visible folder: downloads go
 * through the authenticated route or a short-lived signed URL.
 */
export class ObjectStorageDelivery implements OutputDeliveryAdapter {
  readonly mode = 'download' as const

  constructor(private readonly storage: DocumentStorageProvider) {}

  async publish(artifact: DocumentArtifactRecord, localPath: string): Promise<PublishedObject> {
    if (!existsSync(localPath)) throw new DocumentError('DOCUMENT_OUTPUT_NOT_READY')
    if (this.storage.kind === 'local') throw new DocumentError('DOCUMENT_STORAGE_NOT_CONFIGURED')

    const ref = await this.storage.putObject({
      ownerId: artifact.ownerId,
      key: artifact.storageKey,
      data: createReadStream(localPath),
      mimeType: artifact.mimeType
    })
    return {
      storageProvider: ref.provider,
      storageKey: ref.key,
      size: ref.size,
      checksum: ref.checksum
    }
  }

  async remove(artifact: DocumentArtifactRecord): Promise<void> {
    await this.storage.deleteObject({
      provider: artifact.storageProvider as 's3-compatible',
      key: artifact.storageKey,
      ownerId: artifact.ownerId,
      size: artifact.size,
      mimeType: artifact.mimeType
    })
  }
}

export const localOutputDelivery = new LocalOutputDelivery()
export const ephemeralOutputDelivery = new EphemeralOutputDelivery()
