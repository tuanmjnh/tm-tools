import type { NavigationMenuItem } from '@nuxt/ui'
import type { RouteTreeNode } from '~/types/rbac'

export const useNavMenu = () => {
  const { t } = useI18n()
  const auth = useAuth()

  const allowedRoutes = useState<RouteTreeNode[]>('nav:allowedRoutes', () => [])

  async function fetchRoutes(force = false) {
    if (allowedRoutes.value.length > 0 && !force) return allowedRoutes.value
    if (!auth.isAuthenticated.value) return []

    try {
      const { data } = await $fetch<{ success: boolean, data: RouteTreeNode[] }>('/api/auth/routes')
      allowedRoutes.value = data || []
    } catch {
      allowedRoutes.value = []
    }
    return allowedRoutes.value
  }

  function clearRoutes() {
    allowedRoutes.value = []
  }

  const translateLabel = (node: RouteTreeNode): string => {
    const key = node.label?.startsWith('nav.') ? node.label : `nav.${node.label}`
    const translated = t(key)
    return translated === key ? (node.label || '') : translated
  }

  function mapRouteToNav(node: RouteTreeNode, open: Ref<boolean>): NavigationMenuItem {
    const label = translateLabel(node)

    if (node.children?.length) {
      return {
        label,
        icon: node.icon || 'i-lucide-folder',
        defaultOpen: true,
        type: 'trigger',
        children: node.children.map((child: RouteTreeNode) => mapRouteToNav(child, open))
      }
    }

    return {
      label,
      icon: node.icon || 'i-lucide-circle',
      to: node.path,
      onSelect: () => { open.value = false }
    }
  }

  function buildNavItems(open: Ref<boolean>): NavigationMenuItem[] {
    const hidden = new Set(['settings'])
    return allowedRoutes.value
      .filter((node: RouteTreeNode) => !hidden.has(node.name))
      .map((node: RouteTreeNode) => mapRouteToNav(node, open))
  }

  return {
    allowedRoutes: readonly(allowedRoutes),
    fetchRoutes,
    clearRoutes,
    buildNavItems
  }
}
