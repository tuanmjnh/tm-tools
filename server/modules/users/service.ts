import type { AuthUser } from '../../../types/auth'
import { getDatabase } from '../database/index'

export async function getAllUsers(): Promise<AuthUser[]> {
  const db = await getDatabase()
  return db.getAllUsers()
}

export async function getUsersPaginated(cursor?: string, limit?: number): Promise<{ users: AuthUser[], nextCursor: string | null }> {
  const db = await getDatabase()
  return db.getUsersPaginated(cursor, limit)
}

export async function createUser(input: { email: string, password: string, name: string, role: string, username?: string }): Promise<AuthUser> {
  const db = await getDatabase()
  const existing = await db.findByEmail(input.email)
  if (existing) throw createError({ statusCode: 409, statusMessage: 'error.emailExists', message: 'Email already exists' })
  if (input.username) {
    const existingUsername = await db.findByUsername(input.username)
    if (existingUsername) throw createError({ statusCode: 409, statusMessage: 'error.usernameExists', message: 'Username already exists' })
  }
  return db.createUser({ ...input, platform: 'web' })
}

export async function updateUser(id: string, data: Partial<AuthUser & { password?: string }>): Promise<AuthUser | null> {
  const db = await getDatabase()
  const { password, ...rest } = data
  if (password) {
    await db.updatePassword(id, password)
  }
  return db.updateUser(id, rest)
}

export async function deleteUser(id: string): Promise<void> {
  const db = await getDatabase()
  const user = await db.findById(id)
  if (!user) throw createError({ statusCode: 404, statusMessage: 'error.userNotFound', message: 'User not found' })
  await db.deleteUser(id)
}
