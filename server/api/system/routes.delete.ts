import { deleteRoute } from '../../modules/routes/service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const isRoot = auth.role === 'root' || auth.permissions?.includes('*')
  if (!isRoot) throw createError({ statusCode: 403, statusMessage: 'Only root can manage routes' })

  const id = getQuery(event).id as string
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Route id is required' })

  await deleteRoute(id)
  return { success: true }
})
