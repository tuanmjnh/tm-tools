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
    path: '/tools',
    name: 'tools',
    label: 'nav.tools',
    icon: 'i-lucide-wrench',
    sort: 5,
    children: [
      { path: '/tools/download', name: 'tools-download', label: 'nav.download', icon: 'i-lucide-download', sort: 0 },
      { path: '/tools/video', name: 'tools-video', label: 'nav.video', icon: 'i-lucide-video', sort: 1 }
    ]
  },
  {
    path: '/admin',
    name: 'administration',
    label: 'nav.administration',
    icon: 'i-lucide-shield',
    sort: 6,
    children: [
      { path: '/admin/users', name: 'admin-users', label: 'nav.users', icon: 'i-lucide-user-cog', sort: 0 },
      { path: '/admin/roles', name: 'admin-roles', label: 'nav.roles', icon: 'i-lucide-shield', sort: 1 }
    ]
  },
  {
    path: '/settings',
    name: 'settings',
    label: 'nav.settings',
    icon: 'i-lucide-settings',
    sort: 7,
    children: [
      { path: '/settings', name: 'settings-general', label: 'nav.general', icon: 'i-lucide-user', sort: 0 },
      { path: '/settings/members', name: 'settings-members', label: 'nav.members', icon: 'i-lucide-users', sort: 1 },
      { path: '/settings/notifications', name: 'settings-notifications', label: 'nav.notifications', icon: 'i-lucide-bell', sort: 2 },
      { path: '/settings/security', name: 'settings-security', label: 'nav.security', icon: 'i-lucide-shield', sort: 3 }
    ]
  },
  {
    path: '/system',
    name: 'system',
    label: 'nav.system',
    icon: 'i-lucide-server',
    sort: 8,
    children: [
      { path: '/system/config', name: 'system-config', label: 'nav.config', icon: 'i-lucide-plug', sort: 0 },
      { path: '/system/seed', name: 'system-seed', label: 'nav.seedData', icon: 'i-lucide-database-backup', sort: 1 }
    ]
  }
]

export const seedRoles: SeedRoleDef[] = [
  {
    id: 'root',
    name: 'root',
    description: 'Full system access',
    permissions: [{ module: '*', actions: ['read', 'write', 'delete', 'manage'] }],
    allowedRoutes: ['*'],
    isSystem: true
  },
  {
    id: 'admin',
    name: 'admin',
    description: 'Administrator with most permissions',
    permissions: [
      { module: 'dashboard', actions: ['read'] },
      { module: 'inbox', actions: ['read', 'write'] },
      { module: 'customers', actions: ['read', 'write', 'delete'] },
      { module: 'chat', actions: ['read', 'write'] },
      { module: 'media', actions: ['read', 'write', 'delete'] },
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
      { module: 'settings', actions: ['read'] }
    ],
    allowedRoutes: ['home', 'inbox', 'customers', 'tools', 'chat'],
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
      { module: 'settings', actions: ['read', 'write'] }
    ],
    allowedRoutes: ['home', 'inbox', 'tools', 'chat'],
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
