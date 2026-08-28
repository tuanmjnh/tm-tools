import { checkPermission } from '../modules/rbac/service'

const permissionMap: Record<string, string> = {
  '/api/rbac': 'rbac:read',
  '/api/users': 'users:read',
  '/api/customers': 'customers:read',
  '/api/settings': 'settings:read',
  '/api/media': 'media:read'
}

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) return

  if (auth.permissions?.includes('*') || auth.role === 'root') return

  const path = event.path
  const method = event.method || 'GET'

  for (const [prefix, permission] of Object.entries(permissionMap)) {
    if (path.startsWith(prefix)) {
      const action = method === 'GET' ? 'read' : method === 'POST' ? 'write' : method === 'DELETE' ? 'delete' : 'write'
      const module = permission.split(':')[0] || ''
      if (!checkPermission(auth.permissions || [], module, action)) {
        throw createError({ statusCode: 403, statusMessage: 'error.forbidden', message: `Insufficient permissions for ${module}:${action}` })
      }
    }
  }
})
