import { config } from '../../config/index'

export interface StorageAdapter {
  upload(path: string, buffer: Buffer, options?: Record<string, any>): Promise<string>
  delete(path: string): Promise<void>
  getUrl(path: string): string
}

let cloudinaryAdapter: StorageAdapter | null = null
let firebaseAdapter: StorageAdapter | null = null

export async function getCloudinary(): Promise<StorageAdapter | null> {
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey) return null
  if (!cloudinaryAdapter) {
    const { CloudinaryAdapter } = await import('./cloudinary')
    cloudinaryAdapter = new CloudinaryAdapter()
  }
  return cloudinaryAdapter
}

export async function getFirebaseStorage(): Promise<StorageAdapter | null> {
  if (!config.firebase.projectId) return null
  if (!firebaseAdapter) {
    const { FirebaseAdapter } = await import('./firebase')
    firebaseAdapter = new FirebaseAdapter()
  }
  return firebaseAdapter
}

export async function uploadFile(provider: 'cloudinary' | 'firebase', path: string, buffer: Buffer): Promise<string> {
  if (provider === 'cloudinary') {
    const adapter = await getCloudinary()
    if (!adapter) throw new Error('Cloudinary not configured')
    return adapter.upload(path, buffer)
  }
  const adapter = await getFirebaseStorage()
  if (!adapter) throw new Error('Firebase not configured')
  return adapter.upload(path, buffer)
}
