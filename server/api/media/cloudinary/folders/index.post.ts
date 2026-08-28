import { cloudinaryService } from '../../../../modules/media/cloudinary.service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const body = await readBody(event)

    if (!body.name)
      throw createError({ statusCode: 400, statusMessage: 'error.validation', message: 'Folder name is required' })

    await cloudinaryService.createFolder(body.name)

    return {
      success: true,
      message: 'Folder created successfully'
    }
  } catch (error) {
    handleApiError(error)
  }
})
