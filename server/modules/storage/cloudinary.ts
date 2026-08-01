import { v2 as cloudinary } from 'cloudinary'
import { config } from '../../config/index'
import type { StorageAdapter } from './index'

export class CloudinaryAdapter implements StorageAdapter {
  constructor() {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret
    })
  }

  async upload(path: string, buffer: Buffer, options?: Record<string, any>): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: path, ...options },
        (err, result) => {
          if (err || !result) return reject(err || new Error('Upload failed'))
          resolve(result.secure_url)
        }
      )
      uploadStream.end(buffer)
    })
  }

  async delete(path: string): Promise<void> {
    await cloudinary.uploader.destroy(path)
  }

  getUrl(path: string): string {
    return cloudinary.url(path)
  }
}
