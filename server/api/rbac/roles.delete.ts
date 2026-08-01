import { deleteRole } from '../../modules/rbac/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const ids = (query.id as string).split(',')
  for (const id of ids) {
    if (id) {
      await deleteRole(id)
    }
  }
  return { success: true }
})
