import { cloudinaryService } from '../../../../modules/media/cloudinary.service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const query = getQuery(event)
    const folder = query.folder as string

    const subfolders = await cloudinaryService.listFolders(folder)

    return {
      parent: folder || null,
      folders: (subfolders.folders || []).map(f => ({
        ...f,
        path: f.path || f.name,
        hasChildren: true
      }))
    }
  } catch (error) {
    handleApiError(error)
  }
})
