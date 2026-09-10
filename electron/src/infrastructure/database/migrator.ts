import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import fs from 'fs'
import { getDatabase } from './connection'

export function getMigrationsFolder(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron')
    if (app && app.isPackaged) {
      const prodPath = path.join(process.resourcesPath, 'electron', 'migrations')
      if (fs.existsSync(prodPath)) return prodPath
      return path.join(app.getAppPath(), 'electron', 'migrations')
    }
    if (app && typeof app.getAppPath === 'function') {
      return path.join(app.getAppPath(), 'electron', 'migrations')
    }
  } catch {
    // Ngoài môi trường Electron
  }
  return path.resolve(process.cwd(), 'electron', 'migrations')
}

export function runMigrations(): void {
  const db = getDatabase()
  const migrationsFolder = getMigrationsFolder()

  if (!fs.existsSync(migrationsFolder)) {
    console.warn(`[Migrator] Migrations folder not found at ${migrationsFolder}, skipping auto-migrate.`)
    return
  }

  try {
    migrate(db, { migrationsFolder })
    console.log('[Migrator] Drizzle migrations applied successfully.')
  } catch (error) {
    console.error('[Migrator] Failed to run migrations:', error)
    throw error
  }
}
