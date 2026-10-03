import fs from 'node:fs'
import path from 'node:path'

const TARGET_DIR = 'D:\\Applications\\tm-hub'

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function writeFile(relPath: string, content: string) {
  const fullPath = path.join(TARGET_DIR, relPath)
  ensureDir(path.dirname(fullPath))
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf-8')
  console.log(`[Created] ${relPath}`)
}

console.log('🚀 Scaffolding tm-hub with Media Gateway & Notification Hub in', TARGET_DIR)

// 1. package.json
writeFile('package.json', JSON.stringify({
  name: 'tm-hub',
  version: '1.0.0',
  description: 'Centralized Multi-Tenant Control Plane, IAM, Media Gateway & Notification Hub',
  private: true,
  type: 'module',
  scripts: {
    dev: 'nuxt dev --port 4000',
    build: 'nuxt build',
    preview: 'nuxt preview --port 4000',
    postinstall: 'nuxt prepare',
    typecheck: 'nuxt typecheck',
    seed: 'tsx scripts/seed.ts'
  },
  dependencies: {
    '@iconify-json/lucide': '^1.2.120',
    '@nuxt/ui': '^4.11.0',
    '@supabase/supabase-js': '^2.111.0',
    'bcryptjs': '^2.4.3',
    'cloudinary': '^2.5.1',
    'jose': '^5.9.6',
    'nuxt': '^4.3.1',
    'vue': 'latest',
    'vue-router': 'latest',
    'web-push': '^3.6.7'
  },
  devDependencies: {
    '@types/bcryptjs': '^2.4.6',
    '@types/node': '^22.10.2',
    '@types/web-push': '^3.6.4',
    'tsx': '^4.19.2',
    'typescript': '^5.7.2',
    'vue-tsc': '^2.2.0'
  },
  pnpm: {
    onlyBuiltDependencies: ['esbuild', 'vue-demi']
  }
}, null, 2))

// 2. tsconfig.json
writeFile('tsconfig.json', JSON.stringify({
  extends: './.nuxt/tsconfig.json'
}, null, 2))

// 3. nuxt.config.ts
writeFile('nuxt.config.ts', `
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    jwtSecret: process.env.AUTH_JWT_SECRET || 'dev-super-secure-shared-secret-key-32-chars-min',
    jwtAccessExpiry: process.env.AUTH_ACCESS_TOKEN_EXPIRY || '15m',
    jwtRefreshExpiry: process.env.AUTH_REFRESH_TOKEN_EXPIRY || '7d',
    public: {
      apiPrefix: '/api/v1'
    }
  },
  nitro: {
    routeRules: {
      '/api/**': {
        cors: true,
        headers: {
          'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Id, X-Requested-With'
        }
      }
    }
  }
})
`)

// 4. app/assets/css/main.css
writeFile('app/assets/css/main.css', `
@import "tailwindcss";
@import "@nuxt/ui";
`)

// 5. .env & .env.example
const envContent = `
PORT=4000
HOST=0.0.0.0

# Supabase (Database tập trung duy nhất)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# JWT Token Secrets
AUTH_JWT_SECRET=super-secure-shared-secret-key-32-chars-min
AUTH_ACCESS_TOKEN_EXPIRY=15m
AUTH_REFRESH_TOKEN_EXPIRY=7d
`
writeFile('.env.example', envContent)
writeFile('.env', envContent)

// 6. Supabase SQL Migration (Full with Media and Notifications)
writeFile('supabase/schema.sql', `
-- Enable UUID and Cryptographic extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. BẢNG APPS
CREATE TABLE IF NOT EXISTS public.apps (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  secret_key VARCHAR(128) NOT NULL,
  allowed_origins TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BẢNG USERS (GLOBAL)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  is_super_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG ROLES (GẮN LIỀN VỚI APP)
CREATE TABLE IF NOT EXISTS public.roles (
  id VARCHAR(50) NOT NULL,
  app_id VARCHAR(50) NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  allowed_routes TEXT[] DEFAULT '{}',
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, app_id)
);

-- 4. BẢNG USER_APP_ROLES (GÁN QUYỀN USER TRONG APP)
CREATE TABLE IF NOT EXISTS public.user_app_roles (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  app_id VARCHAR(50) NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  role_id VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, app_id, role_id),
  FOREIGN KEY (role_id, app_id) REFERENCES public.roles(id, app_id) ON DELETE CASCADE
);

-- 5. BẢNG SYSTEM_ROUTES (MENU ĐỘNG CHO TỪNG APP)
CREATE TABLE IF NOT EXISTS public.system_routes (
  id VARCHAR(100) NOT NULL,
  app_id VARCHAR(50) NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  path VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  label VARCHAR(100) NOT NULL,
  icon VARCHAR(50),
  sort INT DEFAULT 0,
  is_visible BOOLEAN DEFAULT TRUE,
  parent_id VARCHAR(100),
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, app_id)
);

-- 6. BẢNG REFRESH_TOKENS
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  app_id VARCHAR(50) NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  platform VARCHAR(20) DEFAULT 'web',
  user_agent TEXT,
  last_ip VARCHAR(50),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. BẢNG APP_CONFIGS (CẤU HÌNH ĐỘNG CHO TỪNG APP: CLOUDINARY, FIREBASE, AI, WEB_PUSH...)
CREATE TABLE IF NOT EXISTS public.app_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id VARCHAR(50) NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  category VARCHAR(50) DEFAULT 'general',
  key VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  is_secret BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT FALSE,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (app_id, key)
);

-- 8. BẢNG AUDIT_LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id VARCHAR(50) NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id),
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. BẢNG PUSH_SUBSCRIPTIONS (QUẢN TRỊ THIẾT BỊ NHẬN PUSH NOTIFICATION THEO APP)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id VARCHAR(50) NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_type VARCHAR(50) DEFAULT 'web',
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth_key TEXT,
  fcm_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (app_id, user_id, endpoint)
);

-- 10. BẢNG NOTIFICATIONS (LƯU TRỮ THÔNG BÁO IN-APP THEO APP)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id VARCHAR(50) NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  icon VARCHAR(255),
  url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_app_roles_lookup ON public.user_app_roles(app_id, user_id);
CREATE INDEX IF NOT EXISTS idx_system_routes_app_sort ON public.system_routes(app_id, sort);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON public.refresh_tokens(user_id, app_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_app_configs_app ON public.app_configs(app_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_app ON public.audit_logs(app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON public.push_subscriptions(app_id, user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(app_id, user_id, is_read, created_at DESC);
`)

// 7. Types
writeFile('types/index.ts', `
export interface App {
  id: string
  name: string
  description?: string
  secretKey: string
  allowedOrigins: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  email: string
  username?: string
  name: string
  avatarUrl?: string
  isSuperAdmin: boolean
  createdAt: string
  updatedAt: string
}

export interface ModulePermission {
  module: string
  actions: ('read' | 'write' | 'delete' | 'manage' | '*')[]
}

export interface Role {
  id: string
  appId: string
  name: string
  description?: string
  permissions: ModulePermission[]
  allowedRoutes: string[]
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

export interface SystemRoute {
  id: string
  appId: string
  path: string
  name: string
  label: string
  icon?: string
  sort: number
  isVisible: boolean
  parentId?: string | null
  isDeleted?: boolean
  children?: SystemRoute[]
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: {
    id: string
    email: string
    name: string
    appId: string
    roles: string[]
    permissions: string[]
    allowedRoutes: string[]
  }
}

export interface AppConfigItem {
  id?: string
  appId: string
  category?: string
  key: string
  value: string
  isSecret?: boolean
  isPublic?: boolean
  description?: string
  updatedAt?: string
}

export interface InAppNotification {
  id: string
  appId: string
  userId: string
  title: string
  body: string
  icon?: string
  url?: string
  isRead: boolean
  createdAt: string
}
`)

// 8. Server Modules: Database
writeFile('server/modules/database/supabase.ts', `
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client
  const config = useRuntimeConfig()
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('Supabase credentials missing in runtimeConfig (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }
  client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  })
  return client
}
`)

// 9. Server Modules: Token (JWT)
writeFile('server/modules/token/jwt.ts', `
import { SignJWT, jwtVerify } from 'jose'
import crypto from 'node:crypto'

export interface TokenPayload {
  sub: string
  appId: string
  email: string
  name: string
  roles: string[]
  permissions: string[]
  allowedRoutes: string[]
  [key: string]: unknown
}

function getSecretKey(): Uint8Array {
  const config = useRuntimeConfig()
  return new TextEncoder().encode(config.jwtSecret)
}

export async function signAccessToken(payload: TokenPayload, expiry = '15m'): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(getSecretKey())
}

export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    return payload as unknown as TokenPayload
  } catch {
    return null
  }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex')
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
`)

// 10. Server Modules: Routes Service
writeFile('server/modules/routes/service.ts', `
import type { SystemRoute } from '../../../types'

export function buildRouteTree(flatRoutes: SystemRoute[]): SystemRoute[] {
  const map = new Map<string, SystemRoute>()
  const roots: SystemRoute[] = []

  const sorted = [...flatRoutes].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))

  for (const item of sorted) {
    map.set(item.id, { ...item, children: [] })
  }

  for (const item of sorted) {
    const current = map.get(item.id)!
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children!.push(current)
    } else {
      roots.push(current)
    }
  }

  return roots
}
`)

// 11. Server Modules: Auth Service
writeFile('server/modules/auth/service.ts', `
import bcrypt from 'bcryptjs'
import { getSupabaseAdmin } from '../database/supabase'
import { signAccessToken, generateRefreshToken, hashToken } from '../token/jwt'
import type { AuthResponse, SystemRoute } from '../../../types'

export async function authenticate(params: {
  appId: string
  email: string
  password: string
  platform?: string
  userAgent?: string
  ip?: string
}): Promise<AuthResponse> {
  const supabase = getSupabaseAdmin()

  // 1. Kiểm tra App hợp lệ & active
  const { data: app, error: appErr } = await supabase
    .from('apps')
    .select('*')
    .eq('id', params.appId)
    .eq('is_active', true)
    .single()

  if (appErr || !app) {
    throw createError({ statusCode: 400, message: 'Invalid or inactive App ID' })
  }

  // 2. Tìm User
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('*')
    .eq('email', params.email.toLowerCase().trim())
    .single()

  if (userErr || !user) {
    throw createError({ statusCode: 401, message: 'Invalid email or password' })
  }

  // 3. Kiểm tra Password
  const isValidPass = await bcrypt.compare(params.password, user.password_hash)
  if (!isValidPass) {
    throw createError({ statusCode: 401, message: 'Invalid email or password' })
  }

  // 4. Lấy Roles & Permissions của User trong App này
  const { data: userRoles } = await supabase
    .from('user_app_roles')
    .select('role_id, is_active')
    .eq('user_id', user.id)
    .eq('app_id', params.appId)
    .eq('is_active', true)

  const roleIds = (userRoles || []).map((r: { role_id: string }) => r.role_id)

  if (user.is_super_admin && roleIds.length === 0) {
    roleIds.push('root')
  }

  if (roleIds.length === 0) {
    throw createError({ statusCode: 403, message: 'User does not have access to this application' })
  }

  // 5. Query quyền chi tiết từ bảng roles
  const { data: rolesData } = await supabase
    .from('roles')
    .select('*')
    .eq('app_id', params.appId)
    .in('id', roleIds)

  const permissionsSet = new Set<string>()
  const allowedRoutesSet = new Set<string>()

  if (user.is_super_admin || roleIds.includes('root')) {
    permissionsSet.add('*')
    allowedRoutesSet.add('*')
  } else {
    for (const role of rolesData || []) {
      for (const perm of (role.permissions || [])) {
        for (const action of (perm.actions || [])) {
          permissionsSet.add(\`\${perm.module}:\${action}\`)
        }
      }
      for (const route of (role.allowed_routes || [])) {
        allowedRoutesSet.add(route)
      }
    }
  }

  const permissions = Array.from(permissionsSet)
  const allowedRoutes = Array.from(allowedRoutesSet)

  // 6. Ký JWT Access Token
  const config = useRuntimeConfig()
  const accessToken = await signAccessToken({
    sub: user.id,
    appId: params.appId,
    email: user.email,
    name: user.name,
    roles: roleIds,
    permissions,
    allowedRoutes
  }, config.jwtAccessExpiry)

  // 7. Tạo và lưu Refresh Token
  const rawRefreshToken = generateRefreshToken()
  const tokenHash = hashToken(rawRefreshToken)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await supabase.from('refresh_tokens').insert({
    user_id: user.id,
    app_id: params.appId,
    token_hash: tokenHash,
    platform: params.platform || 'web',
    user_agent: params.userAgent || '',
    last_ip: params.ip || '',
    expires_at: expiresAt
  })

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: 900,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      appId: params.appId,
      roles: roleIds,
      permissions,
      allowedRoutes
    }
  }
}
`)

// 12. Server Modules: Media (Cloudinary Service per App)
writeFile('server/modules/media/cloudinary.ts', `
import { v2 as cloudinary } from 'cloudinary'
import { getSupabaseAdmin } from '../database/supabase'

export async function getCloudinaryForApp(appId: string) {
  const supabase = getSupabaseAdmin()
  const { data: configs } = await supabase
    .from('app_configs')
    .select('key, value')
    .eq('app_id', appId)
    .in('key', ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'])

  const map: Record<string, string> = {}
  for (const c of configs || []) map[c.key] = c.value

  const cloud_name = map['CLOUDINARY_CLOUD_NAME']
  const api_key = map['CLOUDINARY_API_KEY']
  const api_secret = map['CLOUDINARY_API_SECRET']

  if (!cloud_name || !api_key || !api_secret) {
    throw createError({
      statusCode: 400,
      message: \`Cloudinary configuration missing for appId '\${appId}'. Please configure in TM-Hub Settings.\`
    })
  }

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true })

  return {
    cloudinary,
    credentials: { cloud_name, api_key, api_secret }
  }
}
`)

// 13. Server Modules: Notification (Web Push per App)
writeFile('server/modules/notification/web-push.ts', `
import webpush from 'web-push'
import { getSupabaseAdmin } from '../database/supabase'

export async function sendWebPushNotification(appId: string, subscription: any, payload: { title: string, body: string, icon?: string, url?: string }) {
  const supabase = getSupabaseAdmin()
  const { data: configs } = await supabase
    .from('app_configs')
    .select('key, value')
    .eq('app_id', appId)
    .in('key', ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT'])

  const map: Record<string, string> = {}
  for (const c of configs || []) map[c.key] = c.value

  const publicKey = map['WEB_PUSH_PUBLIC_KEY']
  const privateKey = map['WEB_PUSH_PRIVATE_KEY']
  const subject = map['WEB_PUSH_SUBJECT'] || 'mailto:admin@example.com'

  if (!publicKey || !privateKey) {
    throw new Error('Web Push VAPID keys missing in app_configs')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth_key || subscription.auth
    }
  }

  return await webpush.sendNotification(pushSubscription, JSON.stringify(payload))
}
`)

// 14. Server API: Auth Endpoints
writeFile('server/api/v1/auth/login.post.ts', `
import { authenticate } from '../../../modules/auth/service'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body.appId || !body.email || !body.password) {
    throw createError({ statusCode: 400, message: 'Missing appId, email or password' })
  }

  const userAgent = getHeader(event, 'user-agent')
  const ip = getRequestIP(event, { xForwardedFor: true })

  const result = await authenticate({
    appId: body.appId,
    email: body.email,
    password: body.password,
    platform: body.platform,
    userAgent,
    ip
  })

  return { success: true, data: result }
})
`)

writeFile('server/api/v1/auth/routes.get.ts', `
import { verifyAccessToken } from '../../../modules/token/jwt'
import { getSupabaseAdmin } from '../../../modules/database/supabase'
import { buildRouteTree } from '../../../modules/routes/service'
import type { SystemRoute } from '../../../../types'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: 'Missing or invalid token' })
  }

  const payload = await verifyAccessToken(authHeader.slice(7))
  if (!payload) {
    throw createError({ statusCode: 401, message: 'Invalid or expired token' })
  }

  const appId = (getHeader(event, 'x-app-id') || payload.appId) as string
  const supabase = getSupabaseAdmin()

  const { data: routes, error } = await supabase
    .from('system_routes')
    .select('*')
    .eq('app_id', appId)
    .eq('is_deleted', false)
    .order('sort', { ascending: true })

  if (error) throw createError({ statusCode: 500, message: error.message })

  const flatRoutes: SystemRoute[] = (routes || []).map((r: any) => ({
    id: r.id,
    appId: r.app_id,
    path: r.path,
    name: r.name,
    label: r.label,
    icon: r.icon,
    sort: r.sort,
    isVisible: r.is_visible,
    parentId: r.parent_id,
    isDeleted: r.is_deleted
  }))

  let allowed = flatRoutes
  if (!payload.roles.includes('root') && !payload.allowedRoutes.includes('*')) {
    const allowedSet = new Set(payload.allowedRoutes)
    allowed = flatRoutes.filter((r: SystemRoute) => allowedSet.has(r.id))
  }

  const tree = buildRouteTree(allowed)
  return { success: true, data: tree }
})
`)

writeFile('server/api/v1/auth/me.get.ts', `
import { verifyAccessToken } from '../../../modules/token/jwt'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const payload = await verifyAccessToken(authHeader.slice(7))
  if (!payload) throw createError({ statusCode: 401, message: 'Invalid token' })

  return {
    success: true,
    data: {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      appId: payload.appId,
      roles: payload.roles,
      permissions: payload.permissions,
      allowedRoutes: payload.allowedRoutes
    }
  }
})
`)

writeFile('server/api/v1/auth/refresh.post.ts', `
import { getSupabaseAdmin } from '../../../modules/database/supabase'
import { hashToken, generateRefreshToken, signAccessToken } from '../../../modules/token/jwt'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body.refreshToken || !body.appId) {
    throw createError({ statusCode: 400, message: 'Missing refreshToken or appId' })
  }

  const supabase = getSupabaseAdmin()
  const tokenHash = hashToken(body.refreshToken)

  const { data: record, error } = await supabase
    .from('refresh_tokens')
    .select('*, users(*)')
    .eq('token_hash', tokenHash)
    .eq('app_id', body.appId)
    .is('revoked_at', null)
    .single()

  if (error || !record || new Date(record.expires_at) < new Date()) {
    throw createError({ statusCode: 401, message: 'Refresh token expired or invalid' })
  }

  await supabase
    .from('refresh_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', record.id)

  const newRawRefresh = generateRefreshToken()
  const newHash = hashToken(newRawRefresh)
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await supabase.from('refresh_tokens').insert({
    user_id: record.user_id,
    app_id: body.appId,
    token_hash: newHash,
    expires_at: newExpiry
  })

  const { data: userRoles } = await supabase
    .from('user_app_roles')
    .select('role_id')
    .eq('user_id', record.user_id)
    .eq('app_id', body.appId)
    .eq('is_active', true)

  const roleIds = (userRoles || []).map((r: { role_id: string }) => r.role_id)
  const config = useRuntimeConfig()

  const accessToken = await signAccessToken({
    sub: record.user_id,
    appId: body.appId,
    email: record.users?.email,
    name: record.users?.name,
    roles: roleIds,
    permissions: roleIds.includes('root') ? ['*'] : [],
    allowedRoutes: roleIds.includes('root') ? ['*'] : []
  }, config.jwtAccessExpiry)

  return {
    success: true,
    data: {
      accessToken,
      refreshToken: newRawRefresh,
      expiresIn: 900
    }
  }
})
`)

// 15. Server API: Apps CRUD
writeFile('server/api/v1/apps/index.get.ts', `
import { getSupabaseAdmin } from '../../../modules/database/supabase'

export default defineEventHandler(async () => {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('apps').select('*').order('created_at', { ascending: false })
  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true, data }
})
`)

writeFile('server/api/v1/apps/index.post.ts', `
import { getSupabaseAdmin } from '../../../modules/database/supabase'
import crypto from 'node:crypto'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body.id || !body.name) {
    throw createError({ statusCode: 400, message: 'Missing id or name' })
  }

  const supabase = getSupabaseAdmin()
  const secretKey = crypto.randomBytes(32).toString('hex')

  const { data, error } = await supabase.from('apps').insert({
    id: body.id,
    name: body.name,
    description: body.description || '',
    secret_key: secretKey,
    allowed_origins: body.allowedOrigins || ['*'],
    is_active: body.isActive ?? true
  }).select().single()

  if (error) throw createError({ statusCode: 400, message: error.message })
  return { success: true, data }
})
`)

// 16. Server API: Configs Endpoints
writeFile('server/api/v1/apps/[id]/configs/index.get.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'
import { verifyAccessToken } from '../../../../../modules/token/jwt'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const payload = await verifyAccessToken(authHeader.slice(7))
  if (!payload) throw createError({ statusCode: 401, message: 'Invalid token' })

  if (payload.appId !== appId || !payload.roles.includes('root')) {
    throw createError({
      statusCode: 403,
      message: 'Forbidden: Only ROOT users can view full configurations for this app'
    })
  }

  const supabase = getSupabaseAdmin()
  const { data: configs, error } = await supabase
    .from('app_configs')
    .select('*')
    .eq('app_id', appId)

  if (error) throw createError({ statusCode: 500, message: error.message })

  const result: Record<string, string> = {}
  for (const item of configs || []) {
    result[item.key] = item.value
  }

  return { success: true, data: result }
})
`)

writeFile('server/api/v1/apps/[id]/configs/index.put.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'
import { verifyAccessToken } from '../../../../../modules/token/jwt'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const payload = await verifyAccessToken(authHeader.slice(7))
  if (!payload) throw createError({ statusCode: 401, message: 'Invalid token' })

  if (payload.appId !== appId || !payload.roles.includes('root')) {
    throw createError({
      statusCode: 403,
      message: 'Forbidden: Only ROOT users can update configurations for this app'
    })
  }

  const body = await readBody<Record<string, string>>(event)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Invalid payload' })
  }

  const supabase = getSupabaseAdmin()

  const getCategory = (key: string) => {
    if (key.startsWith('AI_')) return 'ai'
    if (key.startsWith('CLOUDINARY_')) return 'cloudinary'
    if (key.startsWith('FIREBASE_')) return 'firebase'
    if (key.startsWith('WEB_PUSH_')) return 'web_push'
    return 'general'
  }

  const isSecretKey = (key: string) => {
    return key.includes('SECRET') || key.includes('PRIVATE') || key.includes('API_KEY')
  }

  const rows = Object.entries(body).map(([key, value]) => ({
    app_id: appId,
    category: getCategory(key),
    key,
    value: String(value ?? ''),
    is_secret: isSecretKey(key),
    is_public: !isSecretKey(key),
    updated_at: new Date().toISOString()
  }))

  const { error } = await supabase.from('app_configs').upsert(rows, { onConflict: 'app_id,key' })
  if (error) throw createError({ statusCode: 500, message: error.message })

  await supabase.from('audit_logs').insert({
    app_id: appId,
    user_id: payload.sub,
    action: 'UPDATE_CONFIGS',
    details: { keys: Object.keys(body) },
    ip: getRequestIP(event, { xForwardedFor: true })
  })

  return { success: true, message: 'Configurations updated successfully' }
})
`)

writeFile('server/api/v1/apps/[id]/configs/public.get.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const supabase = getSupabaseAdmin()
  const { data: configs, error } = await supabase
    .from('app_configs')
    .select('key, value')
    .eq('app_id', appId)
    .eq('is_public', true)

  if (error) throw createError({ statusCode: 500, message: error.message })

  const result: Record<string, string> = {}
  for (const c of configs || []) {
    result[c.key] = c.value
  }

  return { success: true, data: result }
})
`)

// 17. Server API: Media Gateway Endpoints
writeFile('server/api/v1/apps/[id]/media/folders/index.get.ts', `
import { getCloudinaryForApp } from '../../../../../../modules/media/cloudinary'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const query = getQuery(event)
  const parentFolder = (query.folder as string) || null

  const { cloudinary } = await getCloudinaryForApp(appId)

  try {
    const target = (!parentFolder || parentFolder.toLowerCase() === 'root') ? '' : parentFolder
    if (!target) {
      const res = await cloudinary.api.root_folders()
      return { success: true, data: res.folders || [] }
    }
    const res = await cloudinary.api.sub_folders(target)
    return { success: true, data: res.folders || [] }
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message })
  }
})
`)

writeFile('server/api/v1/apps/[id]/media/folders/index.post.ts', `
import { getCloudinaryForApp } from '../../../../../../modules/media/cloudinary'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const body = await readBody(event)
  if (!body?.folder) throw createError({ statusCode: 400, message: 'Missing folder path' })

  const { cloudinary } = await getCloudinaryForApp(appId)
  try {
    const res = await cloudinary.api.create_folder(body.folder)
    return { success: true, data: res }
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message })
  }
})
`)

writeFile('server/api/v1/apps/[id]/media/resources/index.get.ts', `
import { getCloudinaryForApp } from '../../../../../../modules/media/cloudinary'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const query = getQuery(event)
  const folder = (query.folder as string) || ''
  const limit = Math.min(parseInt(query.limit as string || '20'), 100)
  const nextCursor = (query.nextCursor as string) || undefined

  const { cloudinary } = await getCloudinaryForApp(appId)

  try {
    const expression = folder && folder !== 'root' ? \`folder:\${folder}\` : ''
    let search = cloudinary.search
      .expression(expression)
      .max_results(limit)
      .sort_by('created_at', 'desc')

    if (nextCursor) {
      search = search.next_cursor(nextCursor)
    }

    const res = await search.execute()
    return { success: true, data: res }
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message })
  }
})
`)

writeFile('server/api/v1/apps/[id]/media/signature.post.ts', `
import { getCloudinaryForApp } from '../../../../../modules/media/cloudinary'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const body = await readBody(event)
  const paramsToSign = body?.params || {}

  const { cloudinary, credentials } = await getCloudinaryForApp(appId)

  const timestamp = Math.round(new Date().getTime() / 1000)
  const signParams = { ...paramsToSign, timestamp }

  const signature = cloudinary.utils.api_sign_request(signParams, credentials.api_secret)

  return {
    success: true,
    data: {
      signature,
      timestamp,
      apiKey: credentials.api_key,
      cloudName: credentials.cloud_name
    }
  }
})
`)

writeFile('server/api/v1/apps/[id]/media/resources/index.delete.ts', `
import { getCloudinaryForApp } from '../../../../../../modules/media/cloudinary'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const body = await readBody(event)
  const publicIds = body?.publicIds || []
  if (!Array.isArray(publicIds) || publicIds.length === 0) {
    throw createError({ statusCode: 400, message: 'Missing publicIds array' })
  }

  const { cloudinary } = await getCloudinaryForApp(appId)
  try {
    const res = await cloudinary.api.delete_resources(publicIds)
    return { success: true, data: res }
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message })
  }
})
`)

// 18. Server API: Notification Hub Endpoints
writeFile('server/api/v1/apps/[id]/notifications/subscribe.post.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'
import { verifyAccessToken } from '../../../../../modules/token/jwt'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const payload = await verifyAccessToken(authHeader.slice(7))
  if (!payload || payload.appId !== appId) throw createError({ statusCode: 401, message: 'Invalid token' })

  const body = await readBody(event)
  if (!body?.endpoint) throw createError({ statusCode: 400, message: 'Missing subscription endpoint' })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('push_subscriptions').upsert({
    app_id: appId,
    user_id: payload.sub,
    device_type: body.deviceType || 'web',
    endpoint: body.endpoint,
    p256dh: body.keys?.p256dh,
    auth_key: body.keys?.auth,
    fcm_token: body.fcmToken
  }, { onConflict: 'app_id,user_id,endpoint' }).select().single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true, data }
})
`)

writeFile('server/api/v1/apps/[id]/notifications/index.get.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'
import { verifyAccessToken } from '../../../../../modules/token/jwt'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const payload = await verifyAccessToken(authHeader.slice(7))
  if (!payload || payload.appId !== appId) throw createError({ statusCode: 401, message: 'Invalid token' })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('app_id', appId)
    .eq('user_id', payload.sub)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true, data: data || [] }
})
`)

writeFile('server/api/v1/apps/[id]/notifications/read-all.post.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'
import { verifyAccessToken } from '../../../../../modules/token/jwt'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const payload = await verifyAccessToken(authHeader.slice(7))
  if (!payload || payload.appId !== appId) throw createError({ statusCode: 401, message: 'Invalid token' })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('app_id', appId)
    .eq('user_id', payload.sub)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true }
})
`)

writeFile('server/api/v1/apps/[id]/notifications/send.post.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'
import { verifyAccessToken } from '../../../../../modules/token/jwt'
import { sendWebPushNotification } from '../../../../../modules/notification/web-push'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const payload = await verifyAccessToken(authHeader.slice(7))
  if (!payload || payload.appId !== appId || !payload.roles.includes('root')) {
    throw createError({ statusCode: 403, message: 'Forbidden: Only root can trigger push notifications' })
  }

  const body = await readBody(event)
  if (!body?.title || !body?.body) throw createError({ statusCode: 400, message: 'Missing title or body' })

  const supabase = getSupabaseAdmin()

  // 1. Lưu in-app notification
  const targetUserId = body.userId || payload.sub
  await supabase.from('notifications').insert({
    app_id: appId,
    user_id: targetUserId,
    title: body.title,
    body: body.body,
    icon: body.icon,
    url: body.url
  })

  // 2. Gửi WebPush đến thiết bị đã đăng ký
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('app_id', appId)
    .eq('user_id', targetUserId)

  let sentCount = 0
  for (const sub of subs || []) {
    try {
      await sendWebPushNotification(appId, sub, {
        title: body.title,
        body: body.body,
        icon: body.icon,
        url: body.url
      })
      sentCount++
    } catch {
      // bỏ qua lỗi token hết hạn
    }
  }

  return { success: true, sentCount }
})
`)

// 19. Admin UI Dashboard (app/app.vue & pages)
writeFile('app/app.vue', `
<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
`)

writeFile('app/layouts/default.vue', `
<script setup lang="ts">
const navItems = [
  { label: 'Tổng quan (Dashboard)', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Quản Lý Dự Án (Apps)', icon: 'i-lucide-boxes', to: '/apps' },
  { label: 'Tài Liệu Kiến Trúc', icon: 'i-lucide-book-open', to: '/docs' }
]
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950">
    <aside class="w-64 border-r border-neutral-200 dark:border-neutral-800 flex flex-col p-4 bg-white dark:bg-neutral-900">
      <div class="flex items-center gap-2 mb-6 px-2">
        <UIcon name="i-lucide-layers" class="w-7 h-7 text-primary" />
        <div>
          <h1 class="font-bold text-lg leading-tight">TM Hub</h1>
          <p class="text-[10px] text-neutral-400 uppercase tracking-widest font-semibold">Control Plane</p>
        </div>
      </div>
      <UNavigationMenu :items="navItems" orientation="vertical" class="flex-1" />
      <div class="text-xs text-neutral-400 px-2 py-4 border-t border-neutral-100 dark:border-neutral-800">
        TM Hub v1.0.0
      </div>
    </aside>

    <main class="flex-1 overflow-y-auto p-8">
      <slot />
    </main>
  </div>
</template>
`)

writeFile('app/pages/index.vue', `
<script setup lang="ts">
const { data: appsRes } = await useFetch('/api/v1/apps')
const apps = computed(() => appsRes.value?.data || [])
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">TM Hub - Control Plane & BaaS</h1>
      <p class="text-neutral-500 text-sm">Quản lý định danh, cấu hình remote, Media Gateway và Notification Hub tập trung theo appId.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <UCard>
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-neutral-500">Dự án Đã Đăng Ký</div>
            <div class="text-3xl font-bold mt-1">{{ apps.length }}</div>
          </div>
          <UIcon name="i-lucide-boxes" class="w-8 h-8 text-primary" />
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-neutral-500">Cơ Sở Dữ Liệu</div>
            <div class="text-xl font-semibold mt-1 text-emerald-600 dark:text-emerald-400">Supabase (PostgreSQL)</div>
          </div>
          <UIcon name="i-lucide-database" class="w-8 h-8 text-emerald-500" />
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-neutral-500">Trạng Thái API</div>
            <div class="text-xl font-semibold mt-1 text-primary">Port 4000 (Sẵn Sàng)</div>
          </div>
          <UIcon name="i-lucide-activity" class="w-8 h-8 text-primary" />
        </div>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Danh Sách Ứng Dụng (Apps)</h2>
          <UButton icon="i-lucide-plus" label="Thêm Dự Án Mới" to="/apps" size="sm" />
        </div>
      </template>
      <div v-if="apps.length === 0" class="text-center py-8 text-neutral-400">
        Chưa có dự án nào. Hãy chạy script seed hoặc bấm thêm dự án mới.
      </div>
      <div v-else class="divide-y divide-neutral-200 dark:divide-neutral-800">
        <div v-for="app in apps" :key="app.id" class="py-3 flex items-center justify-between">
          <div>
            <div class="font-medium flex items-center gap-2">
              {{ app.name }}
              <UBadge :label="app.id" variant="subtle" size="xs" />
            </div>
            <div class="text-xs text-neutral-400">{{ app.description || 'Không có mô tả' }}</div>
          </div>
          <div class="flex items-center gap-3">
            <UBadge :color="app.is_active ? 'success' : 'neutral'" :label="app.is_active ? 'Hoạt động' : 'Tạm dừng'" />
            <UButton size="xs" variant="ghost" icon="i-lucide-arrow-right" to="/apps" />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
`)

writeFile('app/pages/apps.vue', `
<script setup lang="ts">
const { data: appsRes, refresh } = await useFetch('/api/v1/apps')
const apps = computed(() => appsRes.value?.data || [])

const isModalOpen = ref(false)
const form = reactive({
  id: '',
  name: '',
  description: ''
})

async function createApp() {
  await $fetch('/api/v1/apps', {
    method: 'POST',
    body: form
  })
  isModalOpen.value = false
  form.id = ''
  form.name = ''
  form.description = ''
  await refresh()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Quản Trị Dự Án (Apps Registry)</h1>
        <p class="text-neutral-500 text-sm">Quản lý danh sách các ứng dụng được phân quyền và cấu hình theo appId.</p>
      </div>
      <UButton icon="i-lucide-plus" label="Tạo Dự Án Mới" @click="isModalOpen = true" />
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <UCard v-for="app in apps" :key="app.id">
        <div class="flex items-start justify-between">
          <div>
            <h3 class="font-bold text-lg">{{ app.name }}</h3>
            <p class="text-xs text-neutral-400 mt-0.5">App ID: <code class="text-primary font-mono">{{ app.id }}</code></p>
          </div>
          <UBadge :color="app.is_active ? 'success' : 'neutral'" :label="app.is_active ? 'Active' : 'Disabled'" />
        </div>
        <p class="text-sm text-neutral-600 dark:text-neutral-300 mt-3">{{ app.description || 'Chưa có mô tả' }}</p>
        <div class="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <div>Secret Key: <span class="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">{{ app.secret_key.slice(0, 10) }}...</span></div>
          <div class="flex gap-1">
            <UBadge label="Media" color="info" variant="subtle" size="xs" />
            <UBadge label="Push" color="warning" variant="subtle" size="xs" />
          </div>
        </div>
      </UCard>
    </div>

    <!-- Modal Create App -->
    <UModal v-model:open="isModalOpen" title="Thêm Dự Án Mới">
      <template #body>
        <div class="space-y-4">
          <UFormField label="App ID (Mã định danh duy nhất, ví dụ: tm-tools)">
            <UInput v-model="form.id" placeholder="tm-tools" />
          </UFormField>
          <UFormField label="Tên Dự Án">
            <UInput v-model="form.name" placeholder="TM Tools Desktop" />
          </UFormField>
          <UFormField label="Mô tả">
            <UTextarea v-model="form.description" placeholder="Ứng dụng quản trị và công cụ tự động hóa desktop..." />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Hủy" @click="isModalOpen = false" />
          <UButton label="Tạo Dự Án" @click="createApp" />
        </div>
      </template>
    </UModal>
  </div>
</template>
`)

// 20. scripts/seed.ts for tm-hub
writeFile('scripts/seed.ts', `
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Vui lòng điền SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY vào .env trước khi seed!')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

async function seed() {
  console.log('🌱 Bắt đầu seed dữ liệu khởi tạo cho TM Hub...')

  // 1. Tạo App tm-tools mặc định
  const { error: appErr } = await supabase.from('apps').upsert({
    id: 'tm-tools',
    name: 'TM Tools Desktop',
    description: 'Ứng dụng Desktop quản trị và công cụ tự động hóa đa năng',
    secret_key: 'tm-tools-secret-master-key-64-chars-length-random-string',
    allowed_origins: ['http://localhost:3000', 'app://electron', '*'],
    is_active: true
  }, { onConflict: 'id' })

  if (appErr) console.error('Lỗi seed app:', appErr.message)
  else console.log('✅ Đã tạo App: tm-tools')

  // 2. Tạo SuperAdmin User (root@example.com / root123)
  const passwordHash = await bcrypt.hash('root123', 10)
  const { data: rootUser, error: userErr } = await supabase.from('users').upsert({
    email: 'root@example.com',
    username: 'root',
    password_hash: passwordHash,
    name: 'Root Administrator',
    is_super_admin: true
  }, { onConflict: 'email' }).select().single()

  if (userErr) console.error('Lỗi seed user:', userErr.message)
  else console.log('✅ Đã tạo User SuperAdmin: root@example.com / root123')

  // 3. Tạo Role 'root' và 'admin' cho tm-tools
  const { error: roleErr } = await supabase.from('roles').upsert([
    {
      id: 'root',
      app_id: 'tm-tools',
      name: 'Root Admin',
      description: 'Toàn quyền kiểm soát hệ thống tm-tools',
      permissions: [{ module: '*', actions: ['*'] }],
      allowed_routes: ['*'],
      is_system: true
    },
    {
      id: 'admin',
      app_id: 'tm-tools',
      name: 'Administrator',
      description: 'Quản trị viên thông thường',
      permissions: [
        { module: 'users', actions: ['read', 'write', 'delete'] },
        { module: 'media', actions: ['read', 'write', 'delete'] },
        { module: 'customers', actions: ['read', 'write', 'delete'] }
      ],
      allowed_routes: ['home', 'inbox', 'customers', 'media', 'chat'],
      is_system: true
    }
  ], { onConflict: 'id,app_id' })

  if (roleErr) console.error('Lỗi seed roles:', roleErr.message)
  else console.log('✅ Đã tạo Roles mặc định cho tm-tools')

  // 4. Gán role root cho user root trong tm-tools
  if (rootUser) {
    await supabase.from('user_app_roles').upsert({
      user_id: rootUser.id,
      app_id: 'tm-tools',
      role_id: 'root',
      is_active: true
    }, { onConflict: 'user_id,app_id,role_id' })
    console.log('✅ Đã gán quyền Root cho user trong tm-tools')
  }

  // 5. Tạo các Routes mặc định cho tm-tools
  const initialRoutes = [
    { id: 'home', app_id: 'tm-tools', path: '/', name: 'home', label: 'nav.home', icon: 'i-lucide-house', sort: 0 },
    { id: 'inbox', app_id: 'tm-tools', path: '/inbox', name: 'inbox', label: 'nav.inbox', icon: 'i-lucide-inbox', sort: 1 },
    { id: 'chat', app_id: 'tm-tools', path: '/chat', name: 'chat', label: 'nav.chat', icon: 'i-lucide-message-square', sort: 3 },
    { id: 'media', app_id: 'tm-tools', path: '/media', name: 'media', label: 'nav.media', icon: 'i-lucide-images', sort: 4 }
  ]

  await supabase.from('system_routes').upsert(initialRoutes, { onConflict: 'id,app_id' })
  console.log('✅ Đã tạo Routes mặc định cho tm-tools')

  // 6. Khởi tạo Cấu hình Động mẫu cho tm-tools
  const initialConfigs = [
    { app_id: 'tm-tools', category: 'general', key: 'APP_NAME', value: 'TM Tools Desktop', is_secret: false, is_public: true },
    { app_id: 'tm-tools', category: 'general', key: 'APP_PORT', value: '3000', is_secret: false, is_public: true },
    { app_id: 'tm-tools', category: 'ai', key: 'AI_PROVIDER', value: 'openai', is_secret: false, is_public: true },
    { app_id: 'tm-tools', category: 'ai', key: 'AI_MODEL', value: 'gpt-4o-mini', is_secret: false, is_public: true },
    { app_id: 'tm-tools', category: 'ai', key: 'AI_API_KEY', value: 'sk-demo-key-replace-me', is_secret: true, is_public: false },
    { app_id: 'tm-tools', category: 'cloudinary', key: 'CLOUDINARY_CLOUD_NAME', value: 'demo-cloud', is_secret: false, is_public: true },
    { app_id: 'tm-tools', category: 'cloudinary', key: 'CLOUDINARY_API_KEY', value: '1234567890', is_secret: false, is_public: true },
    { app_id: 'tm-tools', category: 'cloudinary', key: 'CLOUDINARY_API_SECRET', value: 'demo-cloudinary-secret', is_secret: true, is_public: false }
  ]

  await supabase.from('app_configs').upsert(initialConfigs, { onConflict: 'app_id,key' })
  console.log('✅ Đã tạo Cấu hình Động mặc định cho tm-tools')

  console.log('🎉 Seed hoàn tất!')
}

seed().catch(console.error)
`)

// 21. docs/ARCHITECTURE.md trong TM-HUB
writeFile('docs/ARCHITECTURE.md', `
# TM Hub - Kiến Trúc & Hướng Dẫn Vận Hành Control Plane

## 1. Vai Trò Của TM Hub
TM Hub là trung tâm điều phối (Control Plane) cho toàn bộ hệ sinh thái dự án (hiện tại là \`tm-tools\`, và các ứng dụng web/mobile trong tương lai).

Nhiệm vụ chính:
- **Application Registry:** Khai báo dự án mới, sinh \`appId\` và \`secretKey\`.
- **Identity & Access Management (IAM):** Quản lý tài khoản người dùng, phân quyền RBAC và menu động (\`system_routes\`) theo \`appId\`.
- **Remote Configuration Hub:** Quản lý toàn bộ cấu hình 3rd-party (\`AI_*\`, \`CLOUDINARY_*\`, \`FIREBASE_*\`, \`WEB_PUSH_*\`) theo từng \`appId\`.
- **Media Gateway:** Quản lý Cloudinary folders, resources, upload signature.
- **Notification Hub:** Quản lý push subscriptions và gửi Web Push / FCM notifications.

## 2. Đặc Tả REST API
- **Auth:** \`POST /api/v1/auth/login\`, \`POST /api/v1/auth/refresh\`, \`GET /api/v1/auth/me\`, \`GET /api/v1/auth/routes\`
- **Remote Configs:** \`GET /api/v1/apps/:appId/configs\`, \`PUT /api/v1/apps/:appId/configs\`, \`GET /api/v1/apps/:appId/configs/public\`
- **Media:** \`GET /api/v1/apps/:appId/media/folders\`, \`GET /api/v1/apps/:appId/media/resources\`, \`POST /api/v1/apps/:appId/media/signature\`, \`DELETE /api/v1/apps/:appId/media/resources\`
- **Notifications:** \`POST /api/v1/apps/:appId/notifications/subscribe\`, \`GET /api/v1/apps/:appId/notifications\`, \`POST /api/v1/apps/:appId/notifications/send\`
`)

// 22. README.md
writeFile('README.md', `
# TM Hub - Centralized Multi-Tenant Control Plane, IAM, Media Gateway & Notification Hub

Hệ thống Quản Trị Trung Tâm: Ứng dụng, Định Danh, Phân Quyền, Cấu Hình Động, Media & Notification Gateway xây dựng bằng **Nuxt 4 + Nuxt UI v4** và **Supabase (PostgreSQL)**.

## Cài đặt & Khởi chạy
\`\`\`bash
pnpm install
# Điền SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY vào .env
pnpm seed
pnpm dev
\`\`\`
`)

console.log('✨ Scaffold tm-hub with Media & Notification completed successfully!')
