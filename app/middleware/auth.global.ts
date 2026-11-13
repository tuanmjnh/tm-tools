import type { RouteTreeNode } from '#shared/types/rbac'

const legacyRedirects: Record<string, string> = {
  '/system/settings/profiles': '/browser-hub',
  '/system/settings/profiles/groups': '/browser-hub/groups',
  '/system/settings/profiles/proxies': '/browser-hub/proxies',
  '/profiles': '/browser-hub',
  '/profiles/groups': '/browser-hub/groups',
  '/profiles/proxies': '/browser-hub/proxies',
  '/system/profile': '/system/settings/profile',
  '/system/profile/security': '/system/settings/profile/security',
  '/system/profile/sessions': '/system/settings/profile/sessions',
  '/system/profile/push': '/system/settings/profile/push'
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const legacyTarget = legacyRedirects[to.path.replace(/\/+$/, '')]
  if (legacyTarget) {
    return navigateTo({ path: legacyTarget, query: to.query }, { redirectCode: 301 })
  }

  const publicPages = ['/login', '/register']
  if (publicPages.includes(to.path)) return

  const { fetchUser, isAuthenticated } = useAuth()

  if (!isAuthenticated.value) {
    await fetchUser()
  }

  if (!isAuthenticated.value && to.path !== '/login') {
    const redirect = to.fullPath !== '/' ? to.fullPath : undefined
    return navigateTo(redirect ? { path: '/login', query: { redirect } } : '/login')
  }

  const auth = useAuth()
  const user = auth.user.value
  if (!user) return

  const isRoot = user.role === 'root' || user.permissions?.includes('*')
  if (isRoot) return

  // Device configuration is administrative: root only. Non-root users see the
  // connection banner instead of the page, and the server refuses the API even
  // if the route is typed by hand.
  if (to.path === '/system/settings/hub' || to.path === '/system/settings/ai-local') return navigateTo('/')

  const nav = useNavMenu()
  const routes = await nav.fetchRoutes()

  if (canAccessPath(to.path, routes)) return
  return navigateTo(firstAllowedPath(routes) || '/')
})

function canAccessPath(path: string, nodes: RouteTreeNode[]): boolean {
  if (path === '/') return true
  for (const node of nodes) {
    if (node.path && (node.path === path || path.startsWith(node.path === '/' ? '/' : node.path + '/'))) {
      return true
    }
    if (node.children?.length && canAccessPath(path, node.children)) {
      return true
    }
  }
  return false
}

function firstAllowedPath(nodes: RouteTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.path && node.path !== '/') return node.path
    if (node.children?.length) {
      const child = firstAllowedPath(node.children)
      if (child) return child
    }
  }
  return null
}
