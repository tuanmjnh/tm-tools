import type { AuthUser, UserSession } from '#shared/types/auth'
import type { Role, SystemRoute, UserRole } from '#shared/types/rbac'
import type { AppDatabase } from './app'

export type { AppDatabase } from './app'
export { AppMongoDB } from './app'

export interface DatabaseAdapter {
  connect(): Promise<void>
  disconnect(): Promise<void>

  findByEmail(email: string): Promise<AuthUser | null>
  findByUsername(username: string): Promise<AuthUser | null>
  findById(id: string): Promise<AuthUser | null>
  getAllUsers(): Promise<AuthUser[]>
  getUsersPaginated(cursor?: string, limit?: number): Promise<{ users: AuthUser[], nextCursor: string | null }>
  createUser(data: { email: string, password: string, name: string, role: string, platform: string, username?: string }): Promise<AuthUser>
  updateUser(id: string, data: Partial<AuthUser>): Promise<AuthUser | null>
  updatePassword(id: string, password: string): Promise<void>
  deleteUser(id: string): Promise<void>

  saveRefreshToken(userId: string, token: string, expiresAt: Date, deviceInfo?: { platform?: string, userAgent?: string, lastIp?: string }): Promise<void>
  findRefreshToken(token: string): Promise<{ id: string, userId: string, revokedAt?: string } | null>
  revokeRefreshToken(token: string, revokedBy?: string): Promise<void>
  revokeAllUserTokens(userId: string): Promise<void>
  getUserSessions(userId: string): Promise<UserSession[]>
  revokeSession(userId: string, sessionId: string): Promise<void>

  getRoles(): Promise<Role[]>
  getRoleById(id: string): Promise<Role | null>
  createRole(role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Role>
  updateRole(id: string, data: Partial<Role>): Promise<Role | null>
  deleteRole(id: string): Promise<void>

  getUserRoles(userId: string): Promise<UserRole[]>
  assignRole(userId: string, roleId: string, assignedBy: string): Promise<void>
  removeRole(userId: string, roleId: string): Promise<void>

  getSystemRoutes(): Promise<SystemRoute[]>
  createSystemRoute(data: Omit<SystemRoute, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<SystemRoute>
  updateSystemRoute(id: string, data: Partial<SystemRoute>): Promise<SystemRoute | null>
  deleteSystemRoute(id: string): Promise<void>

  getSystemConfig(): Promise<Record<string, string>>
  saveSystemConfig(values: Record<string, string>): Promise<void>

  addPushSubscription(userId: string, subscription: unknown, deviceType?: string): Promise<void>
  removePushSubscription(userId: string, identifier: string): Promise<void>
  getPushSubscriptions(userId: string): Promise<unknown[]>

  saveNotification(notification: Record<string, unknown>): Promise<unknown>
  getUserNotifications(userId: string, options?: { limit?: number, unreadOnly?: boolean }): Promise<unknown[]>
  markNotificationAsRead(notificationId: string, userId: string): Promise<boolean>
  markAllNotificationsAsRead(userId: string): Promise<number>
  deleteNotifications(userId: string, ids: string[]): Promise<number>
}

let authAdapter: DatabaseAdapter | null = null
let appAdapter: AppDatabase | null = null

export async function getDatabase(): Promise<DatabaseAdapter> {
  if (authAdapter) return authAdapter

  const { MongoDBAdapter } = await import('./mongodb')
  const adapter = new MongoDBAdapter()

  try {
    await adapter.connect()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[Database] Local MongoDB connection skipped or failed:', message)
  }

  authAdapter = adapter
  return authAdapter
}

export async function getAppDatabase(): Promise<AppDatabase> {
  if (appAdapter) return appAdapter

  const { AppMongoDB } = await import('./app')
  const adapter = new AppMongoDB()
  await adapter.connect()
  appAdapter = adapter
  return appAdapter
}

export function getDatabaseSync(): DatabaseAdapter {
  if (!authAdapter) throw new Error('Auth database not initialized. Call getDatabase() first.')
  return authAdapter
}
