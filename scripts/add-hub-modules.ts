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

console.log('🚀 Adding Users, Roles, Routes & Auth endpoints to tm-hub...')

// 1. Auth Logout
writeFile('server/api/v1/auth/logout.post.ts', `
import { getSupabaseAdmin } from '../../../modules/database/supabase'
import { hashToken } from '../../../modules/token/jwt'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (body?.refreshToken) {
    const supabase = getSupabaseAdmin()
    const tokenHash = hashToken(body.refreshToken)
    await supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
  }
  return { success: true }
})
`)

// 2. Auth Register
writeFile('server/api/v1/auth/register.post.ts', `
import bcrypt from 'bcryptjs'
import { getSupabaseAdmin } from '../../../modules/database/supabase'
import { signAccessToken, generateRefreshToken, hashToken } from '../../../modules/token/jwt'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const appId = body.appId || getHeader(event, 'x-app-id') || 'tm-tools'
  const email = body.email?.toLowerCase().trim()
  const password = body.password
  const name = body.name || body.email?.split('@')[0] || 'User'

  if (!email || !password) {
    throw createError({ statusCode: 400, message: 'Missing email or password' })
  }

  const supabase = getSupabaseAdmin()

  // 1. Check existing user
  const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle()
  if (existing) {
    throw createError({ statusCode: 409, message: 'Email already exists' })
  }

  // 2. Hash password & create user
  const passwordHash = await bcrypt.hash(password, 10)
  const { data: newUser, error: createErr } = await supabase.from('users').insert({
    email,
    password_hash: passwordHash,
    name,
    is_super_admin: false
  }).select().single()

  if (createErr || !newUser) {
    throw createError({ statusCode: 500, message: createErr?.message || 'Failed to create user' })
  }

  // 3. Assign default 'user' role
  await supabase.from('user_app_roles').insert({
    user_id: newUser.id,
    app_id: appId,
    role_id: 'user',
    is_active: true
  })

  // 4. Issue Tokens
  const config = useRuntimeConfig()
  const accessToken = await signAccessToken({
    sub: newUser.id,
    appId,
    email: newUser.email,
    name: newUser.name,
    roles: ['user'],
    permissions: [],
    allowedRoutes: []
  }, config.jwtAccessExpiry)

  const rawRefresh = generateRefreshToken()
  const tokenHash = hashToken(rawRefresh)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await supabase.from('refresh_tokens').insert({
    user_id: newUser.id,
    app_id: appId,
    token_hash: tokenHash,
    platform: body.platform || 'web',
    expires_at: expiresAt
  })

  return {
    success: true,
    data: {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: 900,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        appId,
        roles: ['user'],
        permissions: [],
        allowedRoutes: []
      }
    }
  }
})
`)

// 3. Users List per App (with pagination and search)
writeFile('server/api/v1/apps/[id]/users/index.get.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const query = getQuery(event)
  const limit = query.limit ? parseInt(query.limit as string, 10) : 10
  const cursor = query.cursor as string | undefined
  const q = (query.q as string || '').toLowerCase().trim()

  const supabase = getSupabaseAdmin()

  let dbQuery = supabase
    .from('user_app_roles')
    .select(\`
      role_id,
      is_active,
      created_at,
      user:users (
        id,
        email,
        username,
        name,
        avatar_url,
        is_super_admin,
        created_at
      )
    \`)
    .eq('app_id', appId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    dbQuery = dbQuery.lt('created_at', cursor)
  }

  const { data, error } = await dbQuery
  if (error) throw createError({ statusCode: 500, message: error.message })

  const items = (data || []).map((row: any) => ({
    id: row.user?.id,
    email: row.user?.email,
    username: row.user?.username,
    name: row.user?.name,
    avatarUrl: row.user?.avatar_url,
    role: row.role_id,
    isActive: row.is_active,
    createdAt: row.user?.created_at || row.created_at,
    platform: 'web'
  }))

  const filtered = q
    ? items.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q))
    : items

  let nextCursor: string | null = null
  let finalData = filtered
  if (filtered.length > limit) {
    const nextItem = filtered[limit]
    nextCursor = nextItem ? nextItem.createdAt : null
    finalData = filtered.slice(0, limit)
  }

  return { success: true, data: finalData, nextCursor }
})
`)

// 4. User Create per App
writeFile('server/api/v1/apps/[id]/users/index.post.ts', `
import bcrypt from 'bcryptjs'
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const body = await readBody(event)
  const email = body.email?.toLowerCase().trim()
  const password = body.password
  const name = body.name || email.split('@')[0]
  const username = body.username?.trim() || null
  const role = body.role || 'user'

  if (!email || !password) {
    throw createError({ statusCode: 400, message: 'Missing email or password' })
  }

  const supabase = getSupabaseAdmin()

  // 1. Check existing user
  const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle()
  if (existing) {
    throw createError({ statusCode: 409, message: 'Email already exists' })
  }

  if (username) {
    const { data: existingUname } = await supabase.from('users').select('id').eq('username', username).maybeSingle()
    if (existingUname) {
      throw createError({ statusCode: 409, message: 'Username already exists' })
    }
  }

  // 2. Hash and insert user
  const passwordHash = await bcrypt.hash(password, 10)
  const { data: newUser, error: createErr } = await supabase.from('users').insert({
    email,
    username,
    name,
    password_hash: passwordHash,
    is_super_admin: role === 'root'
  }).select().single()

  if (createErr || !newUser) {
    throw createError({ statusCode: 500, message: createErr?.message || 'Failed to create user' })
  }

  // 3. Assign role to app
  await supabase.from('user_app_roles').insert({
    user_id: newUser.id,
    app_id: appId,
    role_id: role,
    is_active: true
  })

  return {
    success: true,
    data: {
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      name: newUser.name,
      role,
      createdAt: newUser.created_at
    }
  }
})
`)

// 5. User Update per App
writeFile('server/api/v1/apps/[id]/users/index.put.ts', `
import bcrypt from 'bcryptjs'
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const userId = (query.id as string) || (await readBody(event))?.id
  if (!appId || !userId) throw createError({ statusCode: 400, message: 'Missing appId or userId' })

  const body = await readBody(event)
  const supabase = getSupabaseAdmin()

  const userUpdates: Record<string, any> = {}
  if (body.name) userUpdates.name = body.name
  if (body.username !== undefined) userUpdates.username = body.username || null
  if (body.password) {
    userUpdates.password_hash = await bcrypt.hash(body.password, 10)
  }

  if (Object.keys(userUpdates).length > 0) {
    userUpdates.updated_at = new Date().toISOString()
    const { error } = await supabase.from('users').update(userUpdates).eq('id', userId)
    if (error) throw createError({ statusCode: 500, message: error.message })
  }

  if (body.role) {
    await supabase.from('user_app_roles').upsert({
      user_id: userId,
      app_id: appId,
      role_id: body.role,
      is_active: true
    }, { onConflict: 'user_id,app_id,role_id' })
  }

  return { success: true }
})
`)

// 6. User Delete per App (batch delete convention)
writeFile('server/api/v1/apps/[id]/users/index.delete.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  const query = getQuery(event)
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const rawIds = (query.id as string || '').split(',').map(s => s.trim()).filter(Boolean)
  if (rawIds.length === 0) throw createError({ statusCode: 400, message: 'Missing id param' })

  const supabase = getSupabaseAdmin()

  for (const uid of rawIds) {
    // Unassign user from this app
    await supabase.from('user_app_roles').delete().eq('app_id', appId).eq('user_id', uid)
  }

  return { success: true }
})
`)

// 7. Roles List per App
writeFile('server/api/v1/apps/[id]/roles/index.get.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('app_id', appId)
    .order('created_at', { ascending: true })

  if (error) throw createError({ statusCode: 500, message: error.message })

  const mapped = (data || []).map((r: any) => ({
    id: r.id,
    appId: r.app_id,
    name: r.name,
    description: r.description,
    permissions: r.permissions || [],
    allowedRoutes: r.allowed_routes || [],
    isSystem: r.is_system || false,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))

  return { success: true, data: mapped }
})
`)

// 8. Role Create per App
writeFile('server/api/v1/apps/[id]/roles/index.post.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const body = await readBody(event)
  const id = body.id || body.name?.toLowerCase().replace(/\\s+/g, '_')
  if (!id || !body.name) throw createError({ statusCode: 400, message: 'Missing id or name' })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('roles').insert({
    id,
    app_id: appId,
    name: body.name,
    description: body.description || '',
    permissions: body.permissions || [],
    allowed_routes: body.allowedRoutes || [],
    is_system: false
  }).select().single()

  if (error) throw createError({ statusCode: 400, message: error.message })
  return { success: true, data }
})
`)

// 9. Role Update per App
writeFile('server/api/v1/apps/[id]/roles/index.put.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const roleId = query.id as string
  if (!appId || !roleId) throw createError({ statusCode: 400, message: 'Missing appId or roleId' })

  const body = await readBody(event)
  const supabase = getSupabaseAdmin()

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString()
  }
  if (body.name) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.permissions !== undefined) updates.permissions = body.permissions
  if (body.allowedRoutes !== undefined) updates.allowed_routes = body.allowedRoutes

  const { data, error } = await supabase
    .from('roles')
    .update(updates)
    .eq('app_id', appId)
    .eq('id', roleId)
    .select()
    .single()

  if (error) throw createError({ statusCode: 400, message: error.message })
  return { success: true, data }
})
`)

// 10. Role Delete per App (batch delete convention)
writeFile('server/api/v1/apps/[id]/roles/index.delete.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  const query = getQuery(event)
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const rawIds = (query.id as string || '').split(',').map(s => s.trim()).filter(Boolean)
  if (rawIds.length === 0) throw createError({ statusCode: 400, message: 'Missing id param' })

  const supabase = getSupabaseAdmin()

  for (const rId of rawIds) {
    // Prevent deleting system role
    const { data: role } = await supabase.from('roles').select('is_system').eq('app_id', appId).eq('id', rId).single()
    if (role?.is_system) {
      throw createError({ statusCode: 400, message: \`Cannot delete system role '\${rId}'\` })
    }
    await supabase.from('roles').delete().eq('app_id', appId).eq('id', rId)
  }

  return { success: true }
})
`)

// 11. System Routes List per App
writeFile('server/api/v1/apps/[id]/routes/index.get.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'
import { buildRouteTree } from '../../../../../modules/routes/service'
import type { SystemRoute } from '../../../../../../types'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('system_routes')
    .select('*')
    .eq('app_id', appId)
    .eq('is_deleted', false)
    .order('sort', { ascending: true })

  if (error) throw createError({ statusCode: 500, message: error.message })

  const routes: SystemRoute[] = (data || []).map((r: any) => ({
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

  const tree = buildRouteTree(routes)
  return { success: true, data: { routes, tree } }
})
`)

// 12. System Route Create per App
writeFile('server/api/v1/apps/[id]/routes/index.post.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  if (!appId) throw createError({ statusCode: 400, message: 'Missing appId' })

  const body = await readBody(event)
  if (!body.id || !body.path || !body.name) {
    throw createError({ statusCode: 400, message: 'Missing id, path or name' })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('system_routes').insert({
    id: body.id,
    app_id: appId,
    path: body.path,
    name: body.name,
    label: body.label || body.name,
    icon: body.icon || 'i-lucide-circle',
    sort: body.sort ?? 0,
    is_visible: body.isVisible ?? true,
    parent_id: body.parentId || null,
    is_deleted: false
  }).select().single()

  if (error) throw createError({ statusCode: 400, message: error.message })
  return { success: true, data }
})
`)

// 13. System Route Update per App
writeFile('server/api/v1/apps/[id]/routes/index.put.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const routeId = (query.id as string) || (await readBody(event))?.id
  if (!appId || !routeId) throw createError({ statusCode: 400, message: 'Missing appId or routeId' })

  const body = await readBody(event)
  const supabase = getSupabaseAdmin()

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString()
  }
  if (body.path !== undefined) updates.path = body.path
  if (body.name !== undefined) updates.name = body.name
  if (body.label !== undefined) updates.label = body.label
  if (body.icon !== undefined) updates.icon = body.icon
  if (body.sort !== undefined) updates.sort = body.sort
  if (body.isVisible !== undefined) updates.is_visible = body.isVisible
  if (body.parentId !== undefined) updates.parent_id = body.parentId

  const { data, error } = await supabase
    .from('system_routes')
    .update(updates)
    .eq('app_id', appId)
    .eq('id', routeId)
    .select()
    .single()

  if (error) throw createError({ statusCode: 400, message: error.message })
  return { success: true, data }
})
`)

// 14. System Route Delete per App
writeFile('server/api/v1/apps/[id]/routes/index.delete.ts', `
import { getSupabaseAdmin } from '../../../../../modules/database/supabase'

export default defineEventHandler(async (event) => {
  const appId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const routeId = query.id as string
  if (!appId || !routeId) throw createError({ statusCode: 400, message: 'Missing appId or routeId' })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('system_routes')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('app_id', appId)
    .eq('id', routeId)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true }
})
`)

console.log('✨ All TM-Hub Users, Roles, Routes & Auth endpoints added successfully!')
