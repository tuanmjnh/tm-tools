import { cloudinaryService } from '../../../../modules/media/cloudinary.service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const query = getQuery(event)

    const nextCursor = query.next_cursor as string
    const maxResults = Number(query.max_results) || 20
    const folder = query.folder as string

    const result = await cloudinaryService.listResources(folder, maxResults, nextCursor)

    return result
  } catch (error) {
    handleApiError(error)
  }
})
