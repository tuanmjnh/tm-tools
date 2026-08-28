export const useCloudinary = () => {
  /**
   * Get signature for Cloudinary upload
   */
  const getSignature = async (folder?: string): Promise<Cloudinary.IResponseSignature> => {
    return await $fetch<Cloudinary.IResponseSignature>('/api/media/cloudinary/signature', {
      query: { folder }
    })
  }

  /**
   * Upload file directly to Cloudinary
   */
  const uploadToCloudinary = async (
    file: File,
    folder?: string,
    onProgress?: (progress: number) => void
  ): Promise<Cloudinary.UploadedResponse> => {
    const folderName = folder?.toLowerCase() === 'root' ? undefined : folder
    const signatureData = await getSignature(folderName)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('api_key', signatureData.apiKey)
    formData.append('timestamp', String(signatureData.timestamp))
    formData.append('signature', signatureData.signature)
    if (signatureData.preset) formData.append('upload_preset', signatureData.preset)
    if (folderName) formData.append('folder', folderName)

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            onProgress(progress)
          }
        })
      }

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'))
      })

      xhr.open('POST', `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/auto/upload`)
      xhr.send(formData)
    })
  }

  /**
   * Get optimized image URL from Cloudinary
   */
  const getOptimizedUrl = (
    publicId: string,
    options: {
      width?: number
      height?: number
      crop?: 'fill' | 'fit' | 'scale' | 'crop' | 'thumb'
      quality?: number | 'auto'
      format?: 'auto' | 'jpg' | 'png' | 'webp'
    } = {}
  ): string => {
    const { cloudinary } = useRuntimeConfig().public as unknown as { cloudinary?: { cloudName?: string } }
    const cloudName = cloudinary?.cloudName || ''

    const transformations: string[] = []

    if (options.width) transformations.push(`w_${options.width}`)
    if (options.height) transformations.push(`h_${options.height}`)
    if (options.crop) transformations.push(`c_${options.crop}`)
    if (options.quality) transformations.push(`q_${options.quality}`)
    if (options.format) transformations.push(`f_${options.format}`)

    const transform = transformations.length > 0 ? `${transformations.join(',')}/` : ''

    return `https://res.cloudinary.com/${cloudName}/image/upload/${transform}${publicId}`
  }

  /**
   * Get video thumbnail URL
   */
  const getVideoThumbnail = (publicId: string, options: { width?: number, height?: number } = {}): string => {
    const { cloudinary } = useRuntimeConfig().public as unknown as { cloudinary?: { cloudName?: string } }
    const cloudName = cloudinary?.cloudName || ''

    const transformations: string[] = ['so_0']

    if (options.width) transformations.push(`w_${options.width}`)
    if (options.height) transformations.push(`h_${options.height}`)

    const transform = transformations.join(',')

    return `https://res.cloudinary.com/${cloudName}/video/upload/${transform}/${publicId}.jpg`
  }

  /**
   * List folders from Cloudinary
   */
  const listFolders = async (folder: string = 'root') => {
    return await $fetch<Cloudinary.IResponseFolders>('/api/media/cloudinary/folders', {
      query: { folder }
    })
  }

  /**
   * List files from Cloudinary
   */
  const listFiles = async (folder: string = 'root', options: { max_results?: number, next_cursor?: string } = {}) => {
    return await $fetch<Cloudinary.IResponseAsset>('/api/media/cloudinary/files', {
      query: { folder, ...options }
    })
  }

  /**
   * Create a new folder
   */
  const createFolder = async (path: string) => {
    return await $fetch('/api/media/cloudinary/folders', {
      method: 'POST',
      body: { name: path }
    })
  }

  /**
   * Delete a folder
   */
  const deleteFolder = async (path: string) => {
    return await $fetch(`/api/media/cloudinary/folders/${encodeURIComponent(path)}`, {
      method: 'DELETE'
    })
  }

  /**
   * Delete a file
   */
  const deleteFile = async (publicId: string) => {
    return await $fetch(`/api/media/cloudinary/files/${encodeURIComponent(publicId)}`, {
      method: 'DELETE'
    })
  }

  /**
   * Rename a file
   */
  const renameFile = async (from: string, to: string): Promise<{ success: boolean, message: string }> => {
    return await $fetch<{ success: boolean, message: string }>('/api/media/cloudinary/files/rename', {
      method: 'PUT',
      body: { from, to }
    })
  }

  /**
   * Get Media & Cloudinary Config Status
   */
  const fetchConfig = async () => {
    return await $fetch<{
      success: boolean
      data: {
        cloudinary: {
          connected: boolean
          cloudName: string
          uploadPreset: string
          folder: string
        }
      }
    }>('/api/media/config')
  }

  return {
    fetchConfig,
    getSignature,
    uploadToCloudinary,
    getOptimizedUrl,
    getVideoThumbnail,
    listFolders,
    listFiles,
    createFolder,
    deleteFolder,
    deleteFile,
    renameFile
  }
}
