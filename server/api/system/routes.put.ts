import { updateRoute } from '../../modules/routes/service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const isRoot = auth.role === 'root' || auth.permissions?.includes('*')
  if (!isRoot) throw createError({ statusCode: 403, statusMessage: 'Only root can manage routes' })

  const id = getQuery(event).id as string
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Route id is required' })

  const body = await readBody(event)
  const route = await updateRoute(id, body)
  if (!route) throw createError({ statusCode: 404, statusMessage: 'Route not found' })
  return { success: true, data: route }
})
