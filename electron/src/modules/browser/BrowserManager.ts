import crypto from 'crypto'
import fs from 'fs'
import type { IBrowserAdapter } from '../../domain/browser/BrowserAdapter'
import type { BrowserProcess, LaunchOptions } from '../../domain/browser/BrowserProcess'
import type {
  AddCustomBrowserInput,
  BrowserEngine,
  BrowserItem,
  TestExecutableResult
} from '../../../../shared/contracts/browser.ipc'
import { ChromiumBrowserAdapter } from '../../infrastructure/adapters/browser/ChromiumAdapter'
import { FirefoxBrowserAdapter } from '../../infrastructure/adapters/browser/FirefoxAdapter'
import { CustomBrowserAdapter } from '../../infrastructure/adapters/browser/CustomAdapter'
import { CamoufoxAdapter } from '../../infrastructure/adapters/browser/CamoufoxAdapter'
import { DonutAdapter } from '../../infrastructure/adapters/browser/DonutAdapter'
import { BrowserOxideAdapter } from '../../infrastructure/adapters/browser/BrowserOxideAdapter'
import { BrowserRepository } from './BrowserRepository'
import { BrowserProcessManager } from './BrowserProcessManager'
import { Logger } from '../../core/Logger'
import { getExecutableVersion } from '../../infrastructure/adapters/browser/browserUtils'

export class BrowserManager {
  private static instance: BrowserManager | null = null
  private readonly adapters = new Map<BrowserEngine, IBrowserAdapter>()
  private readonly repository: BrowserRepository
  private readonly processManager: BrowserProcessManager
  private readonly logger: Logger

  private constructor() {
    this.repository = BrowserRepository.getInstance()
    this.processManager = BrowserProcessManager.getInstance()
    this.logger = Logger.getInstance()

    // Register default and specialized adapters
    this.registerAdapter(new ChromiumBrowserAdapter())
    this.registerAdapter(new FirefoxBrowserAdapter())
    this.registerAdapter(new CamoufoxAdapter())
    this.registerAdapter(new DonutAdapter())
    this.registerAdapter(new BrowserOxideAdapter())
    this.registerAdapter(new CustomBrowserAdapter())
  }

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager()
    }
    return BrowserManager.instance
  }

  public registerAdapter(adapter: IBrowserAdapter): void {
    this.adapters.set(adapter.engine, adapter)
  }

  public getAdapter(engine: BrowserEngine): IBrowserAdapter {
    const adapter = this.adapters.get(engine)
    if (!adapter) {
      throw new Error(`BrowserAdapter not found for engine [${engine}]`)
    }
    return adapter
  }

  public getAdapterById(id: string): IBrowserAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.id === id) return adapter
    }
    return undefined
  }

  public hasAdapter(engine: BrowserEngine): boolean {
    return this.adapters.has(engine)
  }

  public async detectBrowsers(): Promise<BrowserItem[]> {
    this.logger.info('BrowserManager', 'Scanning for installed browsers on the system...')

    const allDetected: Array<{
      name: string
      path: string
      version: string
      engine: BrowserEngine
    }> = []

    // Scan through detection-supported adapters
    for (const adapter of this.adapters.values()) {
      try {
        const detected = await adapter.detect()
        allDetected.push(...detected)
      } catch (err) {
        this.logger.warn('BrowserManager', `Detection error on adapter [${adapter.name}]:`, err)
      }
    }

    const existingInDb = this.repository.findAll()
    const foundPaths = new Set<string>()

    for (const item of allDetected) {
      foundPaths.add(item.path)
      const existing = existingInDb.find(b => b.executablePath.toLowerCase() === item.path.toLowerCase())

      if (existing) {
        this.repository.update(existing.id, {
          name: item.name,
          version: item.version,
          status: 'available',
          detectedAt: new Date()
        })
      } else {
        const isFirst = existingInDb.length === 0
        this.repository.create({
          id: crypto.randomUUID(),
          name: item.name,
          engine: item.engine,
          executablePath: item.path,
          version: item.version,
          isDefault: isFirst,
          isCustom: false,
          status: 'available',
          detectedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }
    }

    // Mark missing for browsers no longer found on disk
    for (const b of existingInDb) {
      if (!b.isCustom && !foundPaths.has(b.executablePath) && !fs.existsSync(b.executablePath)) {
        this.repository.update(b.id, { status: 'missing' })
      }
    }

    const updatedList = this.repository.findAll()

    // Ensure at least one browser is default if available
    const hasDefault = updatedList.some(b => b.isDefault && b.status === 'available')
    if (!hasDefault) {
      const firstAvailable = updatedList.find(b => b.status === 'available')
      if (firstAvailable) {
        this.repository.setDefault(firstAvailable.id)
      }
    }

    return this.listBrowsers()
  }

  public listBrowsers(): BrowserItem[] {
    const list = this.repository.findAll()
    return list.map(b => ({
      id: b.id,
      name: b.name,
      engine: b.engine as BrowserEngine,
      executablePath: b.executablePath,
      version: b.version,
      isDefault: b.isDefault,
      isCustom: b.isCustom,
      detectedAt: b.detectedAt ? b.detectedAt.getTime() : null,
      status: b.status as 'available' | 'missing'
    }))
  }

  public async addCustomBrowser(input: AddCustomBrowserInput): Promise<BrowserItem> {
    if (!fs.existsSync(input.executablePath)) {
      throw new Error(`Executable path does not exist: ${input.executablePath}`)
    }

    const version = await getExecutableVersion(input.executablePath)
    const existing = this.repository.findByPath(input.executablePath)

    if (existing) {
      throw new Error(`A browser with this executable already exists in list: ${existing.name}`)
    }

    const created = this.repository.create({
      id: crypto.randomUUID(),
      name: input.name,
      engine: input.engine,
      executablePath: input.executablePath,
      version,
      isDefault: false,
      isCustom: true,
      status: 'available',
      detectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    })

    return {
      id: created.id,
      name: created.name,
      engine: created.engine as BrowserEngine,
      executablePath: created.executablePath,
      version: created.version,
      isDefault: created.isDefault,
      isCustom: created.isCustom,
      detectedAt: created.detectedAt ? created.detectedAt.getTime() : null,
      status: created.status as 'available' | 'missing'
    }
  }

  public async testExecutable(executablePath: string): Promise<TestExecutableResult> {
    if (!fs.existsSync(executablePath)) {
      return {
        valid: false,
        error: `File not found: ${executablePath}`
      }
    }

    try {
      const version = await getExecutableVersion(executablePath)
      const lower = executablePath.toLowerCase()
      let engine: BrowserEngine = 'chromium'
      if (lower.includes('camoufox')) {
        engine = 'camoufox'
      } else if (lower.includes('donut')) {
        engine = 'donut'
      } else if (lower.includes('oxide')) {
        engine = 'browser_oxide'
      } else if (lower.includes('firefox')) {
        engine = 'firefox'
      }

      return {
        valid: true,
        version,
        engine
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        valid: false,
        error: `Failed to read executable info: ${message}`
      }
    }
  }

  public removeBrowser(id: string): void {
    const browser = this.repository.findById(id)
    if (!browser) {
      throw new Error(`Browser not found with ID: ${id}`)
    }
    this.repository.delete(id)
  }

  public async launchBrowser(options: LaunchOptions): Promise<BrowserProcess> {
    const adapter = this.getAdapter(options.engine)
    const processInfo = await adapter.launch(options)
    this.processManager.registerProcess(processInfo)
    return processInfo
  }
}
