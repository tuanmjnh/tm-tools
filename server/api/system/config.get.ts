import { flattenConfig } from '../../modules/config/service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  const isRoot = auth.role === 'root' || auth.permissions?.includes('*')
  if (!isRoot) throw createError({ statusCode: 403, statusMessage: 'error.forbidden', message: 'Only root role can read config' })

  const values = flattenConfig()
  return { success: true, data: { values, keys: Object.keys(values) } }
})
