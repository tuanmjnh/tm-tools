import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import path from 'path'
import * as schema from './schema'
import { StorageManager } from '../storage/StorageManager'

let sqliteInstance: Database.Database | null = null
let dbInstance: BetterSQLite3Database<typeof schema> | null = null

export function getDatabasePath(): string {
  const storageManager = StorageManager.getInstance()
  return path.join(storageManager.getDatabasePath(), 'app.sqlite')
}

export function getSqlite(): Database.Database {
  if (!sqliteInstance) {
    const dbPath = getDatabasePath()
    sqliteInstance = new Database(dbPath)
    sqliteInstance.pragma('journal_mode = WAL')
    sqliteInstance.pragma('foreign_keys = ON')
  }
  return sqliteInstance
}

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!dbInstance) {
    const sqlite = getSqlite()
    dbInstance = drizzle(sqlite, { schema })
  }
  return dbInstance
}

export function closeDatabase(): void {
  if (sqliteInstance) {
    try {
      sqliteInstance.pragma('wal_checkpoint(TRUNCATE)')
      sqliteInstance.close()
    } catch {
      // ignore
    }
    sqliteInstance = null
    dbInstance = null
  }
}
