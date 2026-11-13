import type { NavigationMenuItem } from '@nuxt/ui'
import type { RouteTreeNode } from '#shared/types/rbac'
import type { HubSystemRoute } from 'tm-hub-client'

function mapHubRouteToRouteTreeNode(hubRoute: HubSystemRoute): RouteTreeNode {
  return {
    id: hubRoute.id,
    path: hubRoute.path,
    name: hubRoute.name,
    label: hubRoute.label,
    icon: hubRoute.icon,
    sort: hubRoute.sort,
    isVisible: hubRoute.isVisible,
    parentId: hubRoute.parentId,
    isDeleted: hubRoute.isDeleted,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    children: hubRoute.children?.map(mapHubRouteToRouteTreeNode)
  }
}

const ROUTES_RETRY_BACKOFF_MS = 30_000

let routesInFlight: Promise<RouteTreeNode[]> | null = null
let routesRetryAfter = 0

export const useNavMenu = () => {
  // The global route middleware calls this composable, and middleware runs
  // outside a component setup — `useI18n()` throws there ("Must be called at
  // the top of a `setup` function"), which turned every non-root navigation
  // into a 500. The app-level composer translates from the same store and
  // still tracks locale changes inside a computed.
  const { $i18n } = useNuxtApp()
  const auth = useAuth()
  const { routes } = useHub()

  const allowedRoutes = useState<RouteTreeNode[]>('nav:allowedRoutes', () => [])

  async function fetchRoutes(force = false) {
    if (allowedRoutes.value.length > 0 && !force) return allowedRoutes.value
    if (!auth.isAuthenticated.value) return []
    if (routesInFlight) return routesInFlight
    if (!force && import.meta.client && Date.now() < routesRetryAfter) return allowedRoutes.value

    const request = (async () => {
      try {
        const res = await routes.list()
        allowedRoutes.value = (res.data || []).map(mapHubRouteToRouteTreeNode)
        routesRetryAfter = 0
      } catch {
        routesRetryAfter = Date.now() + ROUTES_RETRY_BACKOFF_MS
      } finally {
        routesInFlight = null
      }
      return allowedRoutes.value
    })()

    routesInFlight = request
    return request
  }

  function clearRoutes() {
    allowedRoutes.value = []
  }

  const translateRouteLabel = (label?: string | null, name?: string | null): string => {
    const raw = String(label || name || '')
    if (!raw) return ''
    const candidates = raw.startsWith('nav.') ? [raw] : [`nav.${raw}`, raw]
    for (const key of candidates) {
      const translated = $i18n.t(key)
      if (translated && translated !== key) return translated
    }
    return raw
  }

  const translateLabel = (node: RouteTreeNode): string => translateRouteLabel(node.label, node.name)

  function normalizePath(path?: string | null): string {
    return (path || '').replace(/\/+$/, '') || '/'
  }

  function visibleChildren(node: RouteTreeNode): RouteTreeNode[] {
    return (node.children ?? []).filter((child: RouteTreeNode) => child.isVisible !== false)
  }

  function leafPaths(nodes: RouteTreeNode[]): string[] {
    return nodes.flatMap(node => (visibleChildren(node).length
      ? leafPaths(visibleChildren(node))
      : [normalizePath(node.path)]))
  }

  /**
   * A section index link (`/pdf`) is a prefix of its sibling leaves
   * (`/pdf/library`), so router links keep it highlighted on every child page
   * and two sidebar entries look active at once. Those links are marked exact
   * so only a real visit to the section root highlights them.
   */
  function shadowedPaths(nodes: RouteTreeNode[]): Set<string> {
    const paths = leafPaths(nodes).filter(path => path !== '/')
    return new Set(paths.filter(path => paths.some(other => other !== path && other.startsWith(`${path}/`))))
  }

  function mapRouteToNav(node: RouteTreeNode, open: Ref<boolean>, shadowed: Set<string>): NavigationMenuItem {
    const label = translateLabel(node)
    const children = visibleChildren(node)

    if (children.length) {
      return {
        label,
        icon: node.icon || 'i-lucide-folder',
        defaultOpen: false,
        type: 'trigger',
        children: children.map((child: RouteTreeNode) => mapRouteToNav(child, open, shadowed))
      }
    }

    return {
      label,
      icon: node.icon || 'i-lucide-circle',
      to: node.path,
      exact: shadowed.has(normalizePath(node.path)),
      onSelect: () => { open.value = false }
    }
  }

  function buildNavItems(open: Ref<boolean>): NavigationMenuItem[] {
    const hidden = new Set(['settings'])
    const items = allowedRoutes.value
      .filter((node: RouteTreeNode) => !hidden.has(node.name) && node.isVisible !== false)
    const shadowed = shadowedPaths(items)
    return items.map(node => mapRouteToNav(node, open, shadowed))
  }

  return {
    allowedRoutes: readonly(allowedRoutes),
    fetchRoutes,
    clearRoutes,
    translateRouteLabel,
    buildNavItems
  }
}
