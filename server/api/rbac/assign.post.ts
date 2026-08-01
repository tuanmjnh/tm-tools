import { assignRoleToUser, removeRoleFromUser, getUserRoles } from '../../modules/rbac/service'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  const body = await readBody<{ userId: string; roleId: string; action: 'assign' | 'remove' }>(event)

  if (body.action === 'assign') {
    await assignRoleToUser(body.userId, body.roleId, auth!.userId)
  } else {
    await removeRoleFromUser(body.userId, body.roleId)
  }

  const roles = await getUserRoles(body.userId)
  return { success: true, data: roles }
})
