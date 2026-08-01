import { createRole } from '../../modules/rbac/service'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const role = await createRole(body)
  return { success: true, data: role }
})
