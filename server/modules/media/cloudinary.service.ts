import { v2 as cloudinary } from 'cloudinary'
import { config } from '../../config/index'

function getCredentials() {
  return {
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret
  }
}

function getInstance() {
  const creds = getCredentials()
  cloudinary.config(creds)
  return {
    cloudinary,
    config: creds
  }
}

export interface CloudinaryFolder {
  name: string
  path: string
  external_id: string | null
}

export const cloudinaryService = {
  getCredentials,

  async listFolders(parentFolder: string | null = null) {
    const { cloudinary: instance } = getInstance()

    const targetFolder = (!parentFolder || parentFolder.toLowerCase() === 'root') ? '' : parentFolder

    try {
      if (!targetFolder) {
        const result = await instance.api.root_folders()
        return result as { folders: CloudinaryFolder[] }
      }
      const result = await instance.api.sub_folders(targetFolder)
      return result as { folders: CloudinaryFolder[] }
    } catch (error: unknown) {
      console.error('Cloudinary listFolders Error:', error instanceof Error ? error.message : String(error))
      throw error
    }
  },

  async listResources(folderName: string, maxResults = 20, nextCursor?: string) {
    const { cloudinary: instance } = getInstance()

    const targetFolder = (!folderName || folderName.toLowerCase() === 'root') ? '' : folderName
    const expression = targetFolder ? `folder:${targetFolder}` : ''

    try {
      let search = instance.search
        .expression(expression)
        .max_results(maxResults)
        .sort_by('created_at', 'desc')

      if (nextCursor) {
        search = search.next_cursor(nextCursor)
      }

      return await search.execute()
    } catch (error: unknown) {
      console.error('Cloudinary listResources Error:', error instanceof Error ? error.message : String(error))
      throw error
    }
  },

  getSignature(paramsToSign: Record<string, string | number | boolean>) {
    const { config: cfg } = getInstance()
    return cloudinary.utils.api_sign_request(paramsToSign, cfg.api_secret)
  },

  async deleteResources(publicIds: string[]) {
    const { cloudinary: instance } = getInstance()
    return await instance.api.delete_resources(publicIds)
  },

  async deleteFolder(folderPath: string) {
    const { cloudinary: instance } = getInstance()
    return await instance.api.delete_folder(folderPath)
  },

  async createFolder(folderPath: string) {
    const { cloudinary: instance } = getInstance()
    return await instance.api.create_folder(folderPath)
  },

  async renameResource(fromPublicId: string, toPublicId: string, options: Record<string, unknown> = { overwrite: true }) {
    const { cloudinary: instance } = getInstance()
    return await instance.uploader.rename(fromPublicId, toPublicId, options)
  }
}
