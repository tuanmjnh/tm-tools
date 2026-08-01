import { updateRouteOrder } from '../../../modules/routes/service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const isRoot = auth.role === 'root' || auth.permissions?.includes('*')
  if (!isRoot) throw createError({ statusCode: 403, statusMessage: 'Only root can manage routes' })

  const body = await readBody(event)
  const items = Array.isArray(body) ? body : body?.items
  if (!Array.isArray(items)) throw createError({ statusCode: 400, statusMessage: 'items array is required' })

  await updateRouteOrder(items)
  return { success: true }
})
