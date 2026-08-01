import type { Role, ModuleDefinition } from '~/types/rbac'

export const useRBAC = () => {
  const roles = ref<Role[]>([])
  const modules = ref<ModuleDefinition[]>([])
  const loading = ref(false)

  async function fetchRoles(): Promise<Role[]> {
    loading.value = true
    try {
      const { data } = await $fetch<{ success: boolean; data: Role[] }>('/api/rbac/roles')
      roles.value = data
      return data
    } finally {
      loading.value = false
    }
  }

  async function fetchModules(): Promise<ModuleDefinition[]> {
    const { data } = await $fetch<{ success: boolean; data: ModuleDefinition[] }>('/api/rbac/permissions')
    modules.value = data
    return data
  }

  async function createRole(input: { name: string; description: string; permissions: any[] }): Promise<Role> {
    const { data } = await $fetch<{ success: boolean; data: Role }>('/api/rbac/roles', {
      method: 'POST',
      body: input
    })
    await fetchRoles()
    return data
  }

  async function deleteRole(id: string): Promise<void> {
    await $fetch(`/api/rbac/roles?id=${id}`, { method: 'DELETE' })
    await fetchRoles()
  }

  async function assignRole(userId: string, roleId: string): Promise<void> {
    await $fetch('/api/rbac/assign', {
      method: 'POST',
      body: { userId, roleId, action: 'assign' }
    })
  }

  async function removeRole(userId: string, roleId: string): Promise<void> {
    await $fetch('/api/rbac/assign', {
      method: 'POST',
      body: { userId, roleId, action: 'remove' }
    })
  }

  return {
    roles: readonly(roles),
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
