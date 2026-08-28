import { deleteRoute } from '../../modules/routes/service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })
  const isRoot = auth.role === 'root' || auth.permissions?.includes('*')
  if (!isRoot) throw createError({ statusCode: 403, statusMessage: 'error.forbidden', message: 'Only root can manage routes' })

  const id = getQuery(event).id as string
  if (!id) throw createError({ statusCode: 400, statusMessage: 'error.routeIdRequired', message: 'Route id is required' })

  await deleteRoute(id)
  return { success: true }
})
