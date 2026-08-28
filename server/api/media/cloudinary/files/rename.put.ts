import { cloudinaryService } from '../../../../modules/media/cloudinary.service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const body = await readBody(event)

    if (!body.from || !body.to)
      throw createError({ statusCode: 400, statusMessage: 'error.validation', message: 'Both "from" and "to" parameters are required' })

    await cloudinaryService.renameResource(body.from, body.to)

    return {
      success: true,
      message: 'File renamed successfully'
    }
  } catch (error) {
    handleApiError(error)
  }
})
