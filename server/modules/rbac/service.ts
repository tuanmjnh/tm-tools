import type { Role, ModulePermission } from '../../../types/rbac'
import { getDatabase } from '../../modules/database/index'
import { config } from '../../config/index'

export async function getAllRoles(): Promise<Role[]> {
  const db = await getDatabase()
  return db.getRoles()
}

export async function getRole(id: string): Promise<Role | null> {
  const db = await getDatabase()
  return db.getRoleById(id)
}

export async function createRole(data: { name: string, description: string, permissions: ModulePermission[], allowedRoutes?: string[] }): Promise<Role> {
  const db = await getDatabase()
  return db.createRole({ ...data, isSystem: false, allowedRoutes: data.allowedRoutes || [] })
}

export async function updateRole(id: string, data: Partial<Role>): Promise<Role | null> {
  const db = await getDatabase()
  return db.updateRole(id, data)
}

export async function deleteRole(id: string): Promise<void> {
  const db = await getDatabase()
  const role = await db.getRoleById(id)
  if (role?.isSystem) {
    throw createError({ statusCode: 400, statusMessage: 'error.systemRoleProtected', message: 'Cannot delete system roles' })
  }
  await db.deleteRole(id)
}

export async function assignRoleToUser(userId: string, roleId: string, assignedBy: string): Promise<void> {
  const db = await getDatabase()
  await db.assignRole(userId, roleId, assignedBy)
}

export async function removeRoleFromUser(userId: string, roleId: string): Promise<void> {
  const db = await getDatabase()
  await db.removeRole(userId, roleId)
}

export async function getUserRoles(userId: string) {
  const db = await getDatabase()
  return db.getUserRoles(userId)
}

export function getAvailableModules() {
  return config.modules
}

export function checkPermission(userPermissions: string[], module: string, action: string): boolean {
  if (userPermissions.includes('*')) return true
  return userPermissions.includes(`${module}:${action}`)
}

export async function getUserAccess(userId: string, defaultRole: string): Promise<{ permissions: string[], allowedRoutes: string[] }> {
  const db = await getDatabase()
  const roles = await db.getUserRoles(userId)
  const roleNames = roles.length > 0 ? roles.map(r => r.roleId) : [defaultRole || 'user']

  const allPermissions: string[] = []
  const allowedRouteSet = new Set<string>()

  for (const roleName of roleNames) {
    const role = await db.getRoleById(roleName)
    if (!role) continue
    for (const perm of role.permissions) {
      perm.actions.forEach(action => allPermissions.push(`${perm.module}:${action}`))
    }
    for (const routeId of role.allowedRoutes || []) {
      allowedRouteSet.add(routeId)
    }
  }

  if (roleNames.includes('root') || allPermissions.includes('*')) {
    return { permissions: ['*'], allowedRoutes: ['*'] }
  }

  return { permissions: [...new Set(allPermissions)], allowedRoutes: [...allowedRouteSet] }
}

export { type PermissionAction } from '../../../types/rbac'
