import { getAppDatabase } from '../../modules/database'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const body = await readBody(event)

    if (!body.type || !body.title || !body.description || !body.email) {
      throw createError({
        statusCode: 400,
        statusMessage: 'error.validation',
        message: 'Type, title, description, and email are required'
      })
    }

    const appDb = await getAppDatabase()
    await appDb.saveFeedback({
      email: body.email,
      type: body.type,
      title: body.title,
      description: body.description,
      screenshot: body.screenshot || '',
      userId: auth.userId
    })

    return {
      success: true,
      message: 'Feedback submitted successfully'
    }
  } catch (error) {
    handleApiError(error)
  }
})
