import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import { config } from '../../config/index'
import type { StorageAdapter } from './index'

export class FirebaseAdapter implements StorageAdapter {
  private bucket: any

  constructor() {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: config.firebase.projectId,
          clientEmail: config.firebase.clientEmail,
          privateKey: config.firebase.privateKey.replace(/\\n/g, '\n')
        } as any),
        storageBucket: config.firebase.storageBucket
      })
    }
    this.bucket = getStorage().bucket()
  }

  async upload(path: string, buffer: Buffer, options?: Record<string, any>): Promise<string> {
    const file = this.bucket.file(path)
    await file.save(buffer, { contentType: options?.contentType })
    await file.makePublic()
    return `https://storage.googleapis.com/${config.firebase.storageBucket}/${path}`
  }

  async delete(path: string): Promise<void> {
    await this.bucket.file(path).delete()
  }

  getUrl(path: string): string {
    return `https://storage.googleapis.com/${config.firebase.storageBucket}/${path}`
  }
}
