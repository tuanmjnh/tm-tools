import { updateRole } from '../../modules/rbac/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const body = await readBody(event)
  const role = await updateRole(query.id as string, body)
  return { success: true, data: role }
})
