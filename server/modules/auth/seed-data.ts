import type { ModulePermission } from '../../../types/rbac'

export interface SeedRoleDef {
  id: string
  name: string
  description: string
  permissions: ModulePermission[]
  allowedRoutes: string[]
  isSystem: boolean
}

export interface SeedUserDef {
  email: string
  username: string
  password: string
  name: string
  role: string
}

export interface SeedRouteDef {
  path: string
  name: string
  label: string
  icon?: string
  sort?: number
  isVisible?: boolean
  children?: SeedRouteDef[]
}

export const seedRoutes: SeedRouteDef[] = [
  {
    path: '/',
    name: 'home',
    label: 'nav.home',
    icon: 'i-lucide-house',
    sort: 0
  },
  {
    path: '/inbox',
    name: 'inbox',
    label: 'nav.inbox',
    icon: 'i-lucide-inbox',
    sort: 1
  },
  {
    path: '/customers',
    name: 'customers',
    label: 'nav.customers',
    icon: 'i-lucide-users',
    sort: 2
  },
  {
    path: '/chat',
    name: 'chat',
    label: 'nav.chat',
    icon: 'i-lucide-message-square',
    sort: 3
  },
  {
    path: '/media',
    name: 'media',
    label: 'nav.media',
    icon: 'i-lucide-images',
    sort: 4
  },
  {
    path: '/profiles',
    name: 'browser-hub',
    label: 'nav.browser_hub',
    icon: 'i-lucide-globe',
    sort: 5,
    children: [
      { path: '/profiles', name: 'profiles-list', label: 'nav.profiles_list', icon: 'i-lucide-layers', sort: 0 },
      { path: '/profiles/groups', name: 'profiles-groups', label: 'nav.profile_groups', icon: 'i-lucide-folder-tree', sort: 1 },
      { path: '/profiles/proxies', name: 'profiles-proxies', label: 'nav.profile_proxies', icon: 'i-lucide-network', sort: 2 }
    ]
  },
  {
    path: '/tools',
    name: 'tools',
    label: 'nav.tools',
    icon: 'i-lucide-wrench',
    sort: 6,
    children: [
      { path: '/tools/download', name: 'tools-download', label: 'nav.download', icon: 'i-lucide-download', sort: 0 },
      { path: '/tools/video', name: 'tools-video', label: 'nav.video', icon: 'i-lucide-video', sort: 1 }
    ]
  },
  {
    path: '/utilities',
    name: 'utilities',
    label: 'nav.utilities',
    icon: 'i-lucide-shapes',
    sort: 7,
    children: [
      { path: '/utilities/icons', name: 'utilities-icons', label: 'nav.utilities_icons', icon: 'i-lucide-smile', sort: 0 },
      { path: '/utilities/text', name: 'utilities-text', label: 'nav.utilities_text', icon: 'i-lucide-type', sort: 1 }
    ]
  },
  {
    path: '/administration',
    name: 'administration',
    label: 'nav.administration',
    icon: 'i-lucide-shield-check',
    sort: 8,
    children: [
      { path: '/admin/users', name: 'admin-users', label: 'nav.users', icon: 'i-lucide-users', sort: 0 },
      { path: '/admin/roles', name: 'admin-roles', label: 'nav.roles', icon: 'i-lucide-key-round', sort: 1 }
    ]
  },
  {
    path: '/settings',
    name: 'settings',
    label: 'nav.settings',
    icon: 'i-lucide-settings',
    sort: 9,
    children: [
      { path: '/settings', name: 'settings-general', label: 'nav.general', icon: 'i-lucide-user', sort: 0 },
      { path: '/settings/downloads', name: 'settings-downloads', label: 'nav.download_presets', icon: 'i-lucide-download', sort: 1 },
      { path: '/settings/browsers', name: 'settings-browsers', label: 'nav.browsers', icon: 'i-lucide-globe', sort: 2 },
      { path: '/settings/tools', name: 'settings-tools', label: 'nav.tools_binaries', icon: 'i-lucide-wrench', sort: 3 },
      { path: '/settings/notifications', name: 'settings-notifications', label: 'nav.notifications', icon: 'i-lucide-bell', sort: 4 },
      { path: '/settings/security', name: 'settings-security', label: 'nav.security', icon: 'i-lucide-shield', sort: 5 }
    ]
  },
  {
    path: '/system',
    name: 'system',
    label: 'nav.system',
    icon: 'i-lucide-server',
    sort: 10,
    children: [
      { path: '/settings', name: 'system-settings', label: 'nav.settings', icon: 'i-lucide-settings', sort: 0 },
      { path: '/system/config', name: 'system-config', label: 'nav.config', icon: 'i-lucide-plug', sort: 1 },
      { path: '/system/seed', name: 'system-seed', label: 'nav.seedData', icon: 'i-lucide-database-backup', sort: 2 }
    ]
  }
]

export const seedRoles: SeedRoleDef[] = [
  {
    id: 'root',
    name: 'root',
    description: 'Super administrator with full access',
    permissions: [{ module: '*', actions: ['*'] }],
    allowedRoutes: ['*'],
    isSystem: true
  },
  {
    id: 'admin',
    name: 'admin',
    description: 'Administrator with management permissions',
    permissions: [
      { module: 'dashboard', actions: ['read'] },
      { module: 'inbox', actions: ['read', 'write'] },
      { module: 'customers', actions: ['read', 'write', 'delete'] },
      { module: 'chat', actions: ['read', 'write'] },
      { module: 'media', actions: ['read', 'write', 'delete'] },
      { module: 'browser_hub', actions: ['read', 'write', 'delete'] },
      { module: 'tools', actions: ['read', 'write'] },
      { module: 'utilities', actions: ['read', 'write'] },
      { module: 'settings', actions: ['read', 'write'] },
      { module: 'users', actions: ['read', 'write', 'delete'] },
      { module: 'rbac', actions: ['read', 'write'] }
    ],
    allowedRoutes: ['*'],
    isSystem: true
  },
  {
    id: 'moderator',
    name: 'moderator',
    description: 'Moderator with limited permissions',
    permissions: [
      { module: 'dashboard', actions: ['read'] },
      { module: 'inbox', actions: ['read', 'write'] },
      { module: 'customers', actions: ['read'] },
      { module: 'chat', actions: ['read'] },
      { module: 'browser_hub', actions: ['read', 'write'] },
      { module: 'tools', actions: ['read'] },
      { module: 'utilities', actions: ['read'] },
      { module: 'settings', actions: ['read'] }
    ],
    allowedRoutes: ['home', 'inbox', 'customers', 'browser-hub', 'tools', 'utilities', 'chat'],
    isSystem: true
  },
  {
    id: 'user',
    name: 'user',
    description: 'Regular user',
    permissions: [
      { module: 'dashboard', actions: ['read'] },
      { module: 'inbox', actions: ['read', 'write'] },
      { module: 'chat', actions: ['read'] },
      { module: 'browser_hub', actions: ['read', 'write'] },
      { module: 'tools', actions: ['read'] },
      { module: 'utilities', actions: ['read'] },
      { module: 'settings', actions: ['read', 'write'] }
    ],
    allowedRoutes: ['home', 'inbox', 'browser-hub', 'tools', 'utilities', 'chat'],
    isSystem: true
  }
]

export const seedUsers: SeedUserDef[] = [
  {
    email: 'root@example.com',
    username: 'root',
    password: 'root123',
    name: 'Root User',
    role: 'root'
  },
  {
    email: 'admin@example.com',
    username: 'admin',
    password: 'admin123',
    name: 'Admin User',
    role: 'admin'
  },
  {
    email: 'test@example.com',
    username: 'testuser',
    password: 'test123',
    name: 'Test User',
    role: 'user'
  }
]
