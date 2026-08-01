/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Collection, Db } from 'mongodb'
import type { AuthUser, UserSession } from '../../../types/auth'
import type { Role, SystemRoute, UserRole } from '../../../types/rbac'
import { hashPassword, generateId } from '../../utils/crypto'
import { getSharedConnection } from './shared'
import type { DatabaseAdapter } from './index'

export class MongoDBAdapter implements DatabaseAdapter {
  private db: Db | null = null

  async connect(): Promise<void> {
    const conn = await getSharedConnection()
    this.db = conn.db
    await this.ensureIndexes()
  }

  async disconnect(): Promise<void> {
    // Connection shared with app database — don't close here
  }

  private getDb(): Db {
    if (!this.db) throw new Error('MongoDB not connected')
    return this.db
  }

  private users(): Collection {
    return this.getDb().collection('users')
  }

  private refreshTokens(): Collection {
    return this.getDb().collection('refresh_tokens')
  }

  private roles(): Collection {
    return this.getDb().collection('roles')
  }

  private userRoles(): Collection {
    return this.getDb().collection('user_roles')
  }

  private systemRoutes(): Collection {
    return this.getDb().collection('system_routes')
  }

  private async ensureIndexes(): Promise<void> {
    await this.users().createIndex({ email: 1 }, { unique: true })
    await this.refreshTokens().createIndex({ token: 1 }, { unique: true })
    await this.refreshTokens().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    return (await this.users().findOne({ email })) as AuthUser | null
  }

  async findByUsername(username: string): Promise<AuthUser | null> {
    return (await this.users().findOne({ username })) as AuthUser | null
  }

  async findById(id: string): Promise<AuthUser | null> {
    return (await this.users().findOne({ id })) as AuthUser | null
  }

  async getAllUsers(): Promise<AuthUser[]> {
    return (await this.users().find().sort({ createdAt: -1 }).toArray()).map((u: any) => {
      const { password, ...rest } = u
      return rest as AuthUser
    })
  }

  async getUsersPaginated(cursor?: string, limit = 20): Promise<{ users: AuthUser[], nextCursor: string | null }> {
    const query: { createdAt?: { $lt: string } } = {}
    if (cursor) {
      query.createdAt = { $lt: cursor }
    }
    const items = await this.users()
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()

    const safeItems = items.map((u) => {
      const { password, ...safe } = u as unknown as AuthUser
      return safe
    })

    let nextCursor: string | null = null
    if (safeItems.length === limit) {
      const last = safeItems[safeItems.length - 1]
      nextCursor = last ? (last.createdAt || null) : null
    }

    return { users: safeItems, nextCursor }
  }

  async createUser(input: { email: string, password: string, name: string, role: string, platform: string, username?: string }): Promise<AuthUser> {
    const now = new Date().toISOString()
    const user: any = {
      id: generateId(),
      email: input.email,
      name: input.name,
      role: input.role,
      platform: input.platform,
      password: await hashPassword(input.password),
      permissions: [],
      createdAt: now,
      updatedAt: now
    }
    if (input.username) user.username = input.username
    await this.users().insertOne(user)
    const { password, ...safe } = user
    return safe as AuthUser
  }

  async updateUser(id: string, data: Partial<AuthUser>): Promise<AuthUser | null> {
    const result = await this.users().findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' }
    )
    return result as AuthUser | null
  }

  async deleteUser(id: string): Promise<void> {
    await this.users().deleteOne({ id })
    await this.userRoles().deleteMany({ userId: id })
    await this.refreshTokens().deleteMany({ userId: id })
  }

  async updatePassword(id: string, password: string): Promise<void> {
    await this.users().updateOne(
      { id },
      { $set: { password: await hashPassword(password), updatedAt: new Date().toISOString() } }
    )
  }

  async saveRefreshToken(userId: string, token: string, expiresAt: Date, deviceInfo?: { platform?: string, userAgent?: string, lastIp?: string }): Promise<void> {
    await this.refreshTokens().insertOne({
      id: generateId(),
      userId,
      token,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      platform: deviceInfo?.platform || 'web',
      userAgent: deviceInfo?.userAgent || '',
      lastIp: deviceInfo?.lastIp || ''
    })
  }

  async findRefreshToken(token: string): Promise<{ id: string, userId: string, revokedAt?: string } | null> {
    const doc = await this.refreshTokens().findOne({ token })
    if (!doc) return null
    return { id: doc.id, userId: doc.userId, revokedAt: doc.revokedAt }
  }

  async revokeRefreshToken(token: string, revokedBy?: string): Promise<void> {
    await this.refreshTokens().updateOne(
      { token },
      { $set: { revokedAt: new Date().toISOString(), revokedBy } }
    )
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokens().updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date().toISOString() } }
    )
  }

  async getUserSessions(userId: string): Promise<UserSession[]> {
    const now = new Date().toISOString()
    const docs = await this.refreshTokens().find({
      userId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: now }
    }).sort({ createdAt: -1 }).toArray()
    return docs.map((d: any) => ({
      id: d.id,
      platform: d.platform || 'web',
      userAgent: d.userAgent || '',
      lastIp: d.lastIp || '',
      createdAt: d.createdAt,
      expiresAt: d.expiresAt,
      isCurrent: false
    }))
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.refreshTokens().updateOne(
      { id: sessionId, userId },
      { $set: { revokedAt: new Date().toISOString() } }
    )
  }

  async getRoles(): Promise<Role[]> {
    return (await this.roles().find().sort({ name: 1 }).toArray()) as unknown as Role[]
  }

  async getRoleById(id: string): Promise<Role | null> {
    return (await this.roles().findOne({ id })) as unknown as Role | null
  }

  async createRole(role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Role> {
    const now = new Date().toISOString()
    const doc = { ...role, id: role.id || generateId(), createdAt: now, updatedAt: now }
    await this.roles().insertOne(doc)
    return doc as Role
  }

  async updateRole(id: string, data: Partial<Role>): Promise<Role | null> {
    const result = await this.roles().findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' }
    )
    return result as Role | null
  }

  async deleteRole(id: string): Promise<void> {
    await this.roles().deleteOne({ id })
    await this.userRoles().deleteMany({ roleId: id })
  }

  async getUserRoles(userId: string): Promise<UserRole[]> {
    return (await this.userRoles().find({ userId }).toArray()) as unknown as UserRole[]
  }

  async assignRole(userId: string, roleId: string, assignedBy: string): Promise<void> {
    await this.userRoles().updateOne(
      { userId, roleId },
      { $set: { userId, roleId, assignedBy, assignedAt: new Date().toISOString() } },
      { upsert: true }
    )
  }

  async removeRole(userId: string, roleId: string): Promise<void> {
    await this.userRoles().deleteOne({ userId, roleId })
  }

  async getSystemRoutes(): Promise<SystemRoute[]> {
    return (await this.systemRoutes().find().sort({ sort: 1 }).toArray()) as unknown as SystemRoute[]
  }

  async createSystemRoute(data: Omit<SystemRoute, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<SystemRoute> {
    const now = new Date().toISOString()
    const doc = { ...data, id: data.id || generateId(), createdAt: now, updatedAt: now }
    await this.systemRoutes().insertOne(doc)
    return doc as SystemRoute
  }

  async updateSystemRoute(id: string, data: Partial<SystemRoute>): Promise<SystemRoute | null> {
    const result = await this.systemRoutes().findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' }
    )
    return result as SystemRoute | null
  }

  async deleteSystemRoute(id: string): Promise<void> {
    await this.systemRoutes().deleteOne({ id })
    await this.systemRoutes().updateMany(
      { parentId: id },
      { $set: { parentId: null, updatedAt: new Date().toISOString() } }
    )
  }

  async getSystemConfig(): Promise<Record<string, string>> {
    const doc = await this.getDb().collection('app_config').findOne({ _id: 'main' as unknown as import('mongodb').ObjectId })
    return ((doc?.values || {}) as Record<string, string>) ?? {}
  }

  async saveSystemConfig(values: Record<string, string>): Promise<void> {
    await this.getDb().collection('app_config').updateOne(
      { _id: 'main' as unknown as import('mongodb').ObjectId },
      { $set: { values, updatedAt: new Date().toISOString() } },
      { upsert: true }
    )
  }

  async seed(options?: { reset?: boolean }): Promise<void> {
    const { seedAuth } = await import('../auth/seed')
    await seedAuth(this as any, options)
  }
}
