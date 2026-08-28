import { CONFIG_KEYS, flattenConfig, saveConfigValues, applyConfigValues } from '../../modules/config/service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  const isRoot = auth.role === 'root' || auth.permissions?.includes('*')
  if (!isRoot) throw createError({ statusCode: 403, statusMessage: 'error.forbidden', message: 'Only root role can update config' })

  const body = await readBody<{ values?: Record<string, string> }>(event)
  const incoming = body?.values || {}

  const before = flattenConfig()
  const values: Record<string, string> = {}
  for (const key of CONFIG_KEYS) {
    if (key in incoming) values[key] = String(incoming[key])
  }

  await saveConfigValues(values)
  applyConfigValues(values)

  const restartRequired = (values.MONGODB_URI !== undefined && values.MONGODB_URI !== before.MONGODB_URI)
    || (values.MONGODB_DB_NAME !== undefined && values.MONGODB_DB_NAME !== before.MONGODB_DB_NAME)

  return { success: true, data: { values: flattenConfig(), restartRequired } }
})
