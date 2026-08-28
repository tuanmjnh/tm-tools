import { config } from '../../config/index'
import { cloudinaryService } from '../../modules/media/cloudinary.service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const { cloud_name: cloudName, api_key: apiKey } = cloudinaryService.getCredentials()
    const isCloudinaryConnected = !!(cloudName && apiKey && config.cloudinary.apiSecret)

    return {
      success: true,
      data: {
        cloudinary: {
          connected: isCloudinaryConnected,
          cloudName,
          uploadPreset: '',
          folder: ''
        }
      }
    }
  } catch (error) {
    handleApiError(error)
  }
})
