import { getAllRoutes, buildTree } from '../../modules/routes/service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  const routes = await getAllRoutes()
  return { success: true, data: { routes, tree: buildTree(routes) } }
})
