import type { SystemRoute } from '../../../types/rbac'
import { getDatabase } from '../../modules/database/index'

export interface RouteTreeNode extends SystemRoute {
  children?: RouteTreeNode[]
}

export async function getAllRoutes(): Promise<SystemRoute[]> {
  const db = await getDatabase()
  return db.getSystemRoutes()
}

export async function createRoute(data: Partial<SystemRoute>): Promise<SystemRoute> {
  const db = await getDatabase()
  return db.createSystemRoute({
    path: data.path || '',
    name: data.name || '',
    label: data.label || data.name || '',
    icon: data.icon || '',
    sort: data.sort ?? 0,
    isVisible: data.isVisible ?? true,
    parentId: data.parentId ?? null
  })
}

export async function updateRoute(id: string, data: Partial<SystemRoute>): Promise<SystemRoute | null> {
  const db = await getDatabase()
  return db.updateSystemRoute(id, data)
}

export async function deleteRoute(id: string): Promise<void> {
  const db = await getDatabase()
  await db.deleteSystemRoute(id)
}

export async function updateRouteOrder(items: { id: string, sort: number }[]): Promise<void> {
  const db = await getDatabase()
  for (const item of items) {
    await db.updateSystemRoute(item.id, { sort: item.sort })
  }
}

export async function getRoutesForUser(userId: string): Promise<SystemRoute[]> {
  const db = await getDatabase()
  const user = await db.findById(userId)
  if (!user) return []

  const roles = await db.getUserRoles(userId)
  const roleNames = roles.length > 0 ? roles.map(r => r.roleId) : [user.role || 'user']

  if (roleNames.includes('root') || user.permissions?.includes('*')) {
    return db.getSystemRoutes()
  }

  const allowedRouteIds = new Set<string>()
  for (const roleName of roleNames) {
    const role = await db.getRoleById(roleName)
    if (role?.allowedRoutes) {
      role.allowedRoutes.forEach(id => allowedRouteIds.add(id))
    }
  }

  const routes = await db.getSystemRoutes()
  return routes.filter(r => allowedRouteIds.has(r.id) && !r.isDeleted)
}

export function buildTree(routes: SystemRoute[]): RouteTreeNode[] {
  const map = new Map<string, RouteTreeNode>()
  const roots: RouteTreeNode[] = []

  routes.forEach((r) => {
    map.set(r.id, { ...r })
  })

  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId)!
      if (!parent.children) parent.children = []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortNodes = (nodes: RouteTreeNode[]) => {
    nodes.sort((a, b) => a.sort - b.sort)
    nodes.forEach(n => n.children && sortNodes(n.children))
  }
  sortNodes(roots)

  return roots
}

export function flattenTree(nodes: RouteTreeNode[]): SystemRoute[] {
  const result: SystemRoute[] = []
  const walk = (list: RouteTreeNode[]) => {
    for (const node of list) {
      const { children, ...rest } = node
      result.push(rest)
      if (children?.length) walk(children)
    }
  }
  walk(nodes)
  return result
}
