import { getRoutesForUser, buildTree } from '../../modules/routes/service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  const routes = await getRoutesForUser(auth.userId)
  const tree = buildTree(routes.filter(r => r.isVisible && !r.isDeleted))
  return { success: true, data: tree }
})
