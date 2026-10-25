import type { Role, ModuleDefinition, ModulePermission, PermissionAction } from '#shared/types/rbac'
import type { HubRole } from 'tm-hub-client'

function mapHubRoleToRole(hubRole: HubRole): Role {
  const permissions = (hubRole.permissions || []).map(p => ({
    module: p.module,
    actions: p.actions as PermissionAction[]
  }))
  return {
    id: hubRole.id,
    name: hubRole.name,
    description: hubRole.description || '',
    permissions,
    allowedRoutes: hubRole.allowedRoutes,
    isSystem: hubRole.isSystem,
    createdAt: hubRole.createdAt,
    updatedAt: hubRole.updatedAt
  }
}

export const useRBAC = () => {
  const { roles, hubFetch, appId } = useHub()
  const rolesList = ref<Role[]>([])
  const modules = ref<ModuleDefinition[]>([])
  const loading = ref(false)

  const defaultModules: ModuleDefinition[] = [
    { key: 'users', label: 'Users', description: 'User management' },
    { key: 'roles', label: 'Roles', description: 'Role & permission management' },
    { key: 'media', label: 'Media', description: 'Cloudinary media gateway' },
    { key: 'notifications', label: 'Notifications', description: 'Notification management' },
    { key: 'system', label: 'System', description: 'System configuration' },
    { key: 'chat', label: 'Chat', description: 'AI Chat integration' }
  ]

  async function fetchRoles(): Promise<Role[]> {
    loading.value = true
    try {
      const res = await roles.list()
      rolesList.value = (res.data || []).map(mapHubRoleToRole)
      return rolesList.value
    } finally {
      loading.value = false
    }
  }

  async function fetchModules(): Promise<ModuleDefinition[]> {
    modules.value = defaultModules
    return defaultModules
  }

  async function createRole(input: { name: string, description: string, permissions: ModulePermission[], allowedRoutes?: string[] }): Promise<Role> {
    const res = await roles.create(input)
    if (!res.data) throw new Error('Failed to create role')
    await fetchRoles()
    return mapHubRoleToRole(res.data)
  }

  async function deleteRole(id: string): Promise<void> {
    await roles.delete(id)
    await fetchRoles()
  }

  async function assignRole(userId: string, roleId: string): Promise<void> {
    await hubFetch(`/api/v1/apps/${appId}/users`, {
      method: 'PUT',
      query: { id: userId },
      body: { role: roleId }
    })
  }

  async function removeRole(userId: string, _roleId: string): Promise<void> {
    await hubFetch(`/api/v1/apps/${appId}/users`, {
      method: 'PUT',
      query: { id: userId },
      body: { role: 'user' }
    })
  }

  return {
    roles: readonly(rolesList),
    modules: readonly(modules),
    loading: readonly(loading),
    fetchRoles,
    fetchModules,
    createRole,
    deleteRole,
    assignRole,
    removeRole
  }
}
