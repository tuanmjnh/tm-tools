import { cloudinaryService } from '../../../../modules/media/cloudinary.service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const folderName = getRouterParam(event, 'folder')

    if (!folderName)
      throw createError({ statusCode: 400, statusMessage: 'error.validation', message: 'Missing folder name' })

    const decodedFolder = decodeURIComponent(folderName)

    // Note: Folder must be empty to be deleted
    await cloudinaryService.deleteFolder(decodedFolder)

    return {
      success: true,
      message: 'Folder deleted successfully'
    }
  } catch (error) {
    handleApiError(error)
  }
})
