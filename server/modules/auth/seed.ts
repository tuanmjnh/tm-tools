import type { DatabaseAdapter } from '../../modules/database/index'
import type { SystemRoute } from '../../../types/rbac'
import { seedRoles, seedRoutes, seedUsers, type SeedRouteDef } from './seed-data'
import { generateId } from '../../utils/crypto'

export interface SeedOptions {
  reset?: boolean
}

export async function seedAuth(db: DatabaseAdapter, options: SeedOptions = {}): Promise<void> {
  if (options.reset) {
    await clearOldData(db)
  }

  await seedSystemRoutes(db)

  const existingRoles = await db.getRoles()
  const roleByName = (name: string) => existingRoles.find((r: any) => r.name === name)

  // Create missing roles only (idempotent)
  for (const def of seedRoles) {
    if (!roleByName(def.name)) {
      const { allowedRoutes, ...rest } = def
      let routeIds: string[] = ['*']
      try {
        routeIds = await resolveRouteIds(db, allowedRoutes)
      } catch {
        // system_routes table may not exist yet; roles still seed
      }
      await db.createRole({ ...rest, allowedRoutes: routeIds })
    }
  }

  const roles = await db.getRoles()
  const rootRole = roles.find((r: any) => r.name === 'root')

  // Migrate: users with legacy super_admin role get the root role
  const legacyRole = roles.find((r: any) => r.name === 'super_admin')
  if (legacyRole && rootRole) {
    const allUsers = await db.getAllUsers()
    for (const u of allUsers) {
      const userRoles = await db.getUserRoles(u.id)
      const hasLegacy = userRoles.some((ur: any) => ur.roleId === legacyRole.id || ur.role_id === legacyRole.id)
      const hasRoot = userRoles.some((ur: any) => ur.roleId === rootRole.id || ur.role_id === rootRole.id)
      if (hasLegacy && !hasRoot) {
        await db.assignRole(u.id, rootRole.id, u.id)
      }
    }
  }

  const ensureUser = async (def: (typeof seedUsers)[number]) => {
    let user = await db.findByEmail(def.email)
    if (!user) {
      user = await db.createUser({
        email: def.email,
        username: def.username,
        password: def.password,
        name: def.name,
        role: def.role,
        platform: 'web'
      })
    }
    const role = roles.find((r: any) => r.name === def.role)
    if (role && user) {
      const userRoles = await db.getUserRoles(user.id)
      if (!userRoles.some((ur: any) => ur.roleId === role.id || ur.role_id === role.id)) {
        await db.assignRole(user.id, role.id, user.id)
      }
    }
    return user
  }

  for (const def of seedUsers) {
    await ensureUser(def)
  }

  console.log('[Seed] Idempotent seed completed')
  console.log('[Seed] Seeded users:', seedUsers.map(u => `${u.email} / ${u.password}`).join(', '))
}

async function seedSystemRoutes(db: DatabaseAdapter): Promise<void> {
  try {
    const existing = await db.getSystemRoutes()
    const byName = new Map(existing.map(r => [r.name, r]))

    const ensureRoute = async (def: SeedRouteDef, parentId: string | null = null): Promise<string | null> => {
      if (!def.name) return null
      const exists = byName.get(def.name)
      if (exists) {
        if (def.children) {
          for (const child of def.children) {
            await ensureRoute(child, exists.id)
          }
        }
        return exists.id
      }

      const route: Partial<SystemRoute> & { id?: string } = {
        path: def.path,
        name: def.name,
        label: def.label,
        icon: def.icon || '',
        sort: def.sort ?? 0,
        isVisible: def.isVisible ?? true,
        parentId
      }
      if (parentId) route.id = generateId()
      const created = await db.createSystemRoute(route as any)
      byName.set(created.name, created)

      if (def.children) {
        for (const child of def.children) {
          await ensureRoute(child, created.id)
        }
      }
      return created.id
    }

    for (const def of seedRoutes) {
      await ensureRoute(def)
    }
  } catch (err: any) {
    console.warn('[Seed] Skipping system_routes seed:', err?.message || err)
  }
}

async function resolveRouteIds(db: DatabaseAdapter, allowedRoutes: string[]): Promise<string[]> {
  if (allowedRoutes.includes('*')) return ['*']
  const routes = await db.getSystemRoutes()
  const byName = new Map(routes.map(r => [r.name, r.id]))
  const ids = new Set<string>()
  for (const name of allowedRoutes) {
    const id = byName.get(name)
    if (id) {
      ids.add(id)
      // Include all descendants so children are reachable
      const children = routes.filter((r) => {
        let p = r.parentId
        while (p) {
          const parent = routes.find(x => x.id === p)
          if (parent?.id === id) return true
          p = parent?.parentId || null
        }
        return false
      })
      children.forEach(c => ids.add(c.id))
    }
  }
  return [...ids]
}

async function clearOldData(db: DatabaseAdapter): Promise<void> {
  const usersCollection = (db as any).users?.() || null
  if (usersCollection) {
    // MongoDB
    await usersCollection.deleteMany({})
    await (db as any).roles().deleteMany({})
    await (db as any).refreshTokens().deleteMany({})
    await (db as any).userRoles().deleteMany({})
    await (db as any).systemRoutes().deleteMany({})
  } else {
    // Supabase: delete in reverse dependency order
    await (db as any).getClient().from('user_roles').delete().neq('user_id', '')
    await (db as any).getClient().from('refresh_tokens').delete().neq('user_id', '')
    await (db as any).getClient().from('users').delete().neq('email', '')
    await (db as any).getClient().from('roles').delete().neq('id', '')
    await (db as any).getClient().from('system_routes').delete().neq('id', '')
  }
}
