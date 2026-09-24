import { eq, and } from 'drizzle-orm'
import { getDatabase } from '../../infrastructure/database/connection'
import { browsers, type Browser, type NewBrowser } from '../../infrastructure/database/schema/browsers'

export class BrowserRepository {
  private static instance: BrowserRepository | null = null

  public static getInstance(): BrowserRepository {
    if (!BrowserRepository.instance) {
      BrowserRepository.instance = new BrowserRepository()
    }
    return BrowserRepository.instance
  }

  public findAll(): Browser[] {
    const db = getDatabase()
    return db.select().from(browsers).where(eq(browsers.isDeleted, false)).all()
  }

  public findById(id: string): Browser | undefined {
    const db = getDatabase()
    return db.select().from(browsers).where(and(eq(browsers.id, id), eq(browsers.isDeleted, false))).get()
  }

  public findByPath(executablePath: string): Browser | undefined {
    const db = getDatabase()
    return db.select().from(browsers).where(and(eq(browsers.executablePath, executablePath), eq(browsers.isDeleted, false))).get()
  }

  public findByEngine(engine: 'chromium' | 'firefox' | 'custom'): Browser[] {
    const db = getDatabase()
    return db.select().from(browsers).where(and(eq(browsers.engine, engine), eq(browsers.isDeleted, false))).all()
  }

  public findDefault(): Browser | undefined {
    const db = getDatabase()
    return db.select().from(browsers).where(and(eq(browsers.isDefault, true), eq(browsers.isDeleted, false))).get()
  }

  public create(data: NewBrowser): Browser {
    const db = getDatabase()
    db.insert(browsers).values(data).run()
    const created = this.findById(data.id)
    if (!created) {
      throw new Error(`Failed to create browser record with ID: ${data.id}`)
    }
    return created
  }

  public update(id: string, data: Partial<NewBrowser>): Browser | undefined {
    const db = getDatabase()
    db.update(browsers)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(browsers.id, id))
      .run()
    return this.findById(id)
  }

  public delete(id: string): boolean {
    const db = getDatabase()
    const result = db.update(browsers)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(browsers.id, id))
      .run()
    return result.changes > 0
  }

  public setDefault(id: string): void {
    const db = getDatabase()
    // 1. Reset all to false
    db.update(browsers).set({ isDefault: false }).run()
    // 2. Set target to true
    db.update(browsers).set({ isDefault: true }).where(eq(browsers.id, id)).run()
  }
}
