import { cloudinaryService } from '../../../../../modules/media/cloudinary.service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const publicId = getRouterParam(event, 'id')

    if (!publicId)
      throw createError({ statusCode: 400, statusMessage: 'error.validation', message: 'Missing public ID' })

    const decodedPublicId = decodeURIComponent(publicId)

    await cloudinaryService.deleteResources([decodedPublicId])

    return {
      success: true,
      message: 'File deleted successfully'
    }
  } catch (error) {
    handleApiError(error)
  }
})
