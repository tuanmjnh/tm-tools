/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import type { AuthUser, UserSession } from '../../../types/auth'
import type { Role, SystemRoute, UserRole } from '../../../types/rbac'
import { config } from '../../config/index'
import { generateId } from '../../utils/crypto'
import type { DatabaseAdapter } from './index'

function camelToSnake(s: string) {
  return s.replace(/[A-Z]/g, c => '_' + c.toLowerCase())
}

function mapRole(row: any): Role {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: row.permissions || [],
    allowedRoutes: row.allowed_routes ?? row.allowedRoutes ?? [],
    isSystem: row.is_system ?? row.isSystem ?? false,
    createdAt: row.created_at ?? row.createdAt ?? '',
    updatedAt: row.updated_at ?? row.updatedAt ?? ''
  }
}

function mapUser(row: any): AuthUser {
  return {
    ...row,
    createdAt: row.created_at ?? row.createdAt ?? '',
    updatedAt: row.updated_at ?? row.updatedAt ?? ''
  }
}

function mapUserRole(row: any): UserRole {
  return {
    userId: row.user_id ?? row.userId,
    roleId: row.role_id ?? row.roleId,
    assignedBy: row.assigned_by ?? row.assignedBy ?? '',
    assignedAt: row.assigned_at ?? row.assignedAt ?? ''
  }
}

function mapSystemRoute(row: any): SystemRoute {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    label: row.label,
    icon: row.icon ?? '',
    sort: row.sort ?? 0,
    isVisible: row.is_visible ?? row.isVisible ?? true,
    parentId: row.parent_id ?? row.parentId ?? null,
    isDeleted: row.is_deleted ?? row.isDeleted ?? false,
    createdAt: row.created_at ?? row.createdAt ?? '',
    updatedAt: row.updated_at ?? row.updatedAt ?? ''
  }
}

export class SupabaseAdapter implements DatabaseAdapter {
  private client: ReturnType<typeof createClient> | null = null

  async connect(): Promise<void> {
    const key = config.supabase.serviceRoleKey || config.supabase.publishableKey
    this.client = createClient(config.supabase.url, key)
  }

  async disconnect(): Promise<void> {}

  private getClient() {
    if (!this.client) throw new Error('Supabase client not initialized')
    return this.client
  }

  private checkError(error: any, context: string) {
    if (error) {
      console.error(`[Supabase] ${context} failed:`, error.message, error.details, error.hint)
      throw new Error(`Supabase ${context} failed: ${error.message}`)
    }
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const { data, error } = await (this.getClient().from('users') as any)
      .select('*')
      .eq('email', email)
      .maybeSingle()
    this.checkError(error, 'findByEmail')
    return data ? mapUser(data) : null
  }

  async findByUsername(username: string): Promise<AuthUser | null> {
    const { data, error } = await (this.getClient().from('users') as any)
      .select('*')
      .eq('username', username)
      .maybeSingle()
    this.checkError(error, 'findByUsername')
    return data ? mapUser(data) : null
  }

  async findById(id: string): Promise<AuthUser | null> {
    const { data, error } = await (this.getClient().from('users') as any)
      .select('*')
      .eq('id', id)
      .maybeSingle()
    this.checkError(error, 'findById')
    return data ? mapUser(data) : null
  }

  async getAllUsers(): Promise<AuthUser[]> {
    const { data, error } = await (this.getClient().from('users') as any).select('*').order('created_at', { ascending: false })
    this.checkError(error, 'getAllUsers')
    return ((data || []) as any[]).map(mapUser)
  }

  async getUsersPaginated(cursor?: string, limit = 20): Promise<{ users: AuthUser[], nextCursor: string | null }> {
    let query = this.getClient()
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) {
      query = (query as any).lt('created_at', cursor)
    }

    const { data, error } = await (query as any)
    this.checkError(error, 'getUsersPaginated')

    const safeItems = ((data || []) as any[]).map(mapUser)

    let nextCursor: string | null = null
    if (safeItems.length === limit) {
      const last = safeItems[safeItems.length - 1]
      nextCursor = last ? (last.createdAt || null) : null
    }

    return { users: safeItems, nextCursor }
  }

  async deleteUser(id: string): Promise<void> {
    await this.getClient().from('user_roles').delete().eq('user_id', id)
    await this.getClient().from('refresh_tokens').delete().eq('user_id', id)
    await this.getClient().from('users').delete().eq('id', id)
  }

  async createUser(input: { email: string, password: string, name: string, role: string, platform: string, username?: string }): Promise<AuthUser> {
    const now = new Date().toISOString()
    const { hashPassword } = await import('../../utils/crypto')
    const passwordHash = await hashPassword(input.password)

    const userRecord: any = {
      id: generateId(),
      email: input.email,
      name: input.name,
      role: input.role,
      platform: input.platform,
      password: passwordHash,
      created_at: now,
      updated_at: now
    }
    if (input.username) userRecord.username = input.username

    const { error: insertError } = await (this.getClient().from('users') as any).insert(userRecord)
    if (insertError) throw new Error(insertError.message)

    return {
      id: userRecord.id,
      email: input.email,
      name: input.name,
      role: input.role,
      platform: input.platform as any,
      password: passwordHash,
      permissions: [],
      createdAt: now,
      updatedAt: now
    } as any
  }

  async updateUser(id: string, data: Partial<AuthUser>): Promise<AuthUser | null> {
    const snakeData: any = {}
    for (const [k, v] of Object.entries(data)) {
      snakeData[camelToSnake(k)] = v
    }
    const { data: updated, error } = await (this.getClient().from('users') as any)
      .update({ ...snakeData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    this.checkError(error, 'updateUser')
    return updated ? mapUser(updated) : null
  }

  async updatePassword(id: string, password: string): Promise<void> {
    const { hashPassword } = await import('../../utils/crypto')
    const passwordHash = await hashPassword(password)
    const { error } = await (this.getClient().from('users') as any)
      .update({ password: passwordHash, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
  }

  async saveRefreshToken(userId: string, token: string, expiresAt: Date, deviceInfo?: { platform?: string, userAgent?: string, lastIp?: string }): Promise<void> {
    const { error } = await (this.getClient().from('refresh_tokens') as any)
      .insert({
        user_id: userId,
        token,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
        platform: deviceInfo?.platform || 'web',
        user_agent: deviceInfo?.userAgent || '',
        last_ip: deviceInfo?.lastIp || ''
      })
    this.checkError(error, 'saveRefreshToken')
  }

  async findRefreshToken(token: string): Promise<{ id: string, userId: string, revokedAt?: string } | null> {
    const { data } = await (this.getClient().from('refresh_tokens') as any)
      .select('id, user_id, revoked_at')
      .eq('token', token)
      .maybeSingle()
    if (!data) return null
    return { id: data.id, userId: data.user_id, revokedAt: data.revoked_at }
  }

  async revokeRefreshToken(token: string, revokedBy?: string): Promise<void> {
    await (this.getClient().from('refresh_tokens') as any)
      .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy })
      .eq('token', token)
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await (this.getClient().from('refresh_tokens') as any)
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null)
  }

  async getUserSessions(userId: string): Promise<UserSession[]> {
    const now = new Date().toISOString()
    const { data, error } = await (this.getClient().from('refresh_tokens') as any)
      .select('*')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
    this.checkError(error, 'getUserSessions')
    return ((data || []) as any[]).map((d: any) => ({
      id: d.id,
      platform: d.platform || 'web',
      userAgent: d.user_agent || '',
      lastIp: d.last_ip || '',
      createdAt: d.created_at,
      expiresAt: d.expires_at,
      isCurrent: false
    }))
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await (this.getClient().from('refresh_tokens') as any)
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId)
  }

  async getRoles(): Promise<Role[]> {
    const { data, error } = await (this.getClient().from('roles') as any).select('*').order('name', { ascending: true })
    this.checkError(error, 'getRoles')
    return ((data || []) as any[]).map(mapRole)
  }

  async getRoleById(id: string): Promise<Role | null> {
    const { data, error } = await (this.getClient().from('roles') as any).select('*').eq('id', id).maybeSingle()
    this.checkError(error, 'getRoleById')
    return data ? mapRole(data) : null
  }

  async createRole(role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Role> {
    const now = new Date().toISOString()
    const { isSystem, allowedRoutes, ...rest } = role
    const { data, error } = await (this.getClient().from('roles') as any)
      .insert({ ...rest, id: role.id || generateId(), allowed_routes: allowedRoutes || [], is_system: isSystem, created_at: now, updated_at: now })
      .select()
      .single()
    this.checkError(error, 'createRole')
    return mapRole(data)
  }

  async updateRole(id: string, data: Partial<Role>): Promise<Role | null> {
    const snakeData: any = {}
    for (const [k, v] of Object.entries(data)) {
      snakeData[camelToSnake(k)] = v
    }
    const { data: updated, error } = await (this.getClient().from('roles') as any)
      .update({ ...snakeData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    this.checkError(error, 'updateRole')
    return updated ? mapRole(updated) : null
  }

  async deleteRole(id: string): Promise<void> {
    await this.getClient().from('roles').delete().eq('id', id)
  }

  async getUserRoles(userId: string): Promise<UserRole[]> {
    const { data, error } = await (this.getClient().from('user_roles') as any)
      .select('*')
      .eq('user_id', userId)
    this.checkError(error, 'getUserRoles')
    return ((data || []) as any[]).map(mapUserRole)
  }

  async assignRole(userId: string, roleId: string, assignedBy: string): Promise<void> {
    const { error } = await (this.getClient().from('user_roles') as any)
      .upsert({ user_id: userId, role_id: roleId, assigned_by: assignedBy, assigned_at: new Date().toISOString() })
    this.checkError(error, 'assignRole')
  }

  async removeRole(userId: string, roleId: string): Promise<void> {
    await (this.getClient().from('user_roles') as any)
      .delete()
      .eq('user_id', userId)
      .eq('role_id', roleId)
  }

  async getSystemRoutes(): Promise<SystemRoute[]> {
    const { data, error } = await (this.getClient().from('system_routes') as any).select('*').order('sort', { ascending: true })
    this.checkError(error, 'getSystemRoutes')
    return ((data || []) as any[]).map(mapSystemRoute)
  }

  async createSystemRoute(data: Omit<SystemRoute, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<SystemRoute> {
    const now = new Date().toISOString()
    const row: any = {}
    for (const [k, v] of Object.entries(data)) {
      row[camelToSnake(k)] = v
    }
    row.id = data.id || generateId()
    row.created_at = now
    row.updated_at = now
    const { data: created, error } = await (this.getClient().from('system_routes') as any)
      .insert(row)
      .select()
      .single()
    this.checkError(error, 'createSystemRoute')
    return mapSystemRoute(created)
  }

  async updateSystemRoute(id: string, data: Partial<SystemRoute>): Promise<SystemRoute | null> {
    const snakeData: any = {}
    for (const [k, v] of Object.entries(data)) {
      snakeData[camelToSnake(k)] = v
    }
    const { data: updated, error } = await (this.getClient().from('system_routes') as any)
      .update({ ...snakeData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    this.checkError(error, 'updateSystemRoute')
    return updated ? mapSystemRoute(updated) : null
  }

  async deleteSystemRoute(id: string): Promise<void> {
    await (this.getClient().from('system_routes') as any).update({ parent_id: null, updated_at: new Date().toISOString() }).eq('parent_id', id)
    await (this.getClient().from('system_routes') as any).delete().eq('id', id)
  }

  async getSystemConfig(): Promise<Record<string, string>> {
    const { data, error } = await (this.getClient().from('app_config') as any)
      .select('values')
      .eq('id', 'main')
      .maybeSingle()
    if (error) {
      console.error('[Supabase] getSystemConfig failed:', error.message)
      return {}
    }
    return (data?.values as Record<string, string>) || {}
  }

  async saveSystemConfig(values: Record<string, string>): Promise<void> {
    const { error } = await (this.getClient().from('app_config') as any)
      .upsert({ id: 'main', values, updated_at: new Date().toISOString() })
    this.checkError(error, 'saveSystemConfig')
  }

  async addPushSubscription(userId: string, subscription: unknown, deviceType?: string): Promise<void> {
    const sub = subscription as any
    if (sub.fcmToken) {
      await (this.getClient().from('user_push_subscriptions') as any).delete().eq('fcm_token', sub.fcmToken)
    } else if (sub.endpoint) {
      await (this.getClient().from('user_push_subscriptions') as any).delete().eq('endpoint', sub.endpoint)
    }

    const { error } = await (this.getClient().from('user_push_subscriptions') as any).insert({
      user_id: userId,
      fcm_token: sub.fcmToken || null,
      endpoint: sub.endpoint || null,
      keys: sub.keys || null,
      device_type: deviceType || null
    })
    if (error) console.error('[Supabase] addPushSubscription failed:', error.message)
  }

  async removePushSubscription(userId: string, identifier: string): Promise<void> {
    await (this.getClient().from('user_push_subscriptions') as any).delete()
      .eq('user_id', userId)
      .or(`endpoint.eq.${identifier},fcm_token.eq.${identifier}`)
  }

  async getPushSubscriptions(userId: string): Promise<unknown[]> {
    const { data, error } = await (this.getClient().from('user_push_subscriptions') as any).select('*').eq('user_id', userId)
    if (error) {
      console.error('[Supabase] getPushSubscriptions failed:', error.message)
      return []
    }
    return (data || []).map((row: any) => ({
      userId: row.user_id,
      fcmToken: row.fcm_token,
      endpoint: row.endpoint,
      keys: row.keys,
      deviceType: row.device_type,
      createdAt: row.created_at
    }))
  }

  async saveNotification(notification: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await (this.getClient().from('notifications') as any).insert({
      recipient_id: notification.recipientId,
      sender: notification.sender || null,
      body: notification.body || notification.message || '',
      is_read: false
    }).select().single()
    if (error) {
      console.error('[Supabase] saveNotification failed:', error.message)
      throw new Error(error.message)
    }
    return {
      id: data.id,
      unread: !data.is_read,
      sender: data.sender || { name: 'System' },
      body: data.body,
      date: data.created_at
    }
  }

  async getUserNotifications(userId: string, options?: { limit?: number, unreadOnly?: boolean }): Promise<unknown[]> {
    let query = (this.getClient().from('notifications') as any).select('*').eq('recipient_id', userId)
    if (options?.unreadOnly) {
      query = query.eq('is_read', false)
    }
    const limit = options?.limit || 20
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)
    if (error) {
      console.error('[Supabase] getUserNotifications failed:', error.message)
      return []
    }
    return (data || []).map((row: any) => ({
      id: row.id,
      unread: !row.is_read,
      sender: row.sender || { name: 'System' },
      body: row.body,
      date: row.created_at
    }))
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<boolean> {
    const { data, error } = await (this.getClient().from('notifications') as any).update({
      is_read: true,
      read_at: new Date().toISOString()
    }).eq('id', notificationId).eq('recipient_id', userId).select()
    if (error) {
      console.error('[Supabase] markNotificationAsRead failed:', error.message)
      return false
    }
    return (data || []).length > 0
  }

  async markAllNotificationsAsRead(userId: string): Promise<number> {
    const { data, error } = await (this.getClient().from('notifications') as any).update({
      is_read: true,
      read_at: new Date().toISOString()
    }).eq('recipient_id', userId).eq('is_read', false).select()
    if (error) {
      console.error('[Supabase] markAllNotificationsAsRead failed:', error.message)
      return 0
    }
    return (data || []).length
  }

  async deleteNotifications(userId: string, ids: string[]): Promise<number> {
    const { data, error } = await (this.getClient().from('notifications') as any).delete()
      .eq('recipient_id', userId)
      .in('id', ids)
      .select()
    if (error) {
      console.error('[Supabase] deleteNotifications failed:', error.message)
      return 0
    }
    return (data || []).length
  }

  async seed(options?: { reset?: boolean }): Promise<void> {
    const { seedAuth } = await import('../auth/seed')
    await seedAuth(this as any, options)
  }
}
