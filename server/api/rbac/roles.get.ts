import { getAllRoles } from '../../modules/rbac/service'

export default defineEventHandler(async () => {
  const roles = await getAllRoles()
  return { success: true, data: roles }
})
