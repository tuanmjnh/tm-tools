import { cloudinaryService } from '../../../modules/media/cloudinary.service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const query = getQuery(event)
    const creds = cloudinaryService.getCredentials()

    const folder = (query.folder as string) || ''
    const timestamp = Math.round(Date.now() / 1000)

    const paramsToSign: Record<string, string | number | boolean> = { timestamp }
    if (folder && folder.toLowerCase() !== 'root') paramsToSign.folder = folder
    const signature = cloudinaryService.getSignature(paramsToSign)

    return {
      signature,
      timestamp,
      cloudName: creds.cloud_name,
      apiKey: creds.api_key,
      preset: '',
      folder
    }
  } catch (error) {
    handleApiError(error)
  }
})
