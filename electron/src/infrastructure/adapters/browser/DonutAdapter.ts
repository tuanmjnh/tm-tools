import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { IBrowserAdapter, DetectionResult } from '../../../domain/browser/BrowserAdapter'
import type { BrowserProcess, LaunchOptions } from '../../../domain/browser/BrowserProcess'
import type { BrowserCapabilities, BrowserEngine } from '../../../../../shared/contracts/browser.ipc'
import { getExecutableVersion, killProcessTree, getConfiguredPath } from './browserUtils'

export class DonutAdapter implements IBrowserAdapter {
  public readonly id = 'donut-adapter'
  public readonly name = 'Donut Browser'
  public readonly engine: BrowserEngine = 'donut'

  public async detect(): Promise<DetectionResult[]> {
    const results: DetectionResult[] = []
    const candidates: string[] = []

    const configuredPath = getConfiguredPath('DONUT_PATH')
    if (configuredPath) {
      candidates.push(configuredPath)
    }

    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || ''
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
      candidates.push(
        path.join(localAppData, 'DonutBrowser', 'donut.exe'),
        path.join(localAppData, 'Programs', 'DonutBrowser', 'donut.exe'),
        path.join(programFiles, 'Donut Browser', 'donut.exe'),
        path.join(process.cwd(), 'resources', 'bin', 'donut', 'donut.exe')
      )
    } else {
      candidates.push(
        '/usr/local/bin/donut',
        '/usr/bin/donut'
      )
    }

    for (const exePath of candidates) {
      if (fs.existsSync(exePath)) {
        try {
          const version = await this.getVersion(exePath)
          results.push({
            installed: true,
            name: 'Donut Browser',
            path: exePath,
            version,
            engine: 'donut'
          })
          break
        } catch {
          // ignore
        }
      }
    }

    return results
  }

  public async getVersion(executablePath: string): Promise<string> {
    return getExecutableVersion(executablePath)
  }

  public async launch(options: LaunchOptions): Promise<BrowserProcess> {
    if (!fs.existsSync(options.executablePath)) {
      throw new Error(`Donut Browser executable not found: ${options.executablePath}`)
    }

    if (!fs.existsSync(options.userDataDir)) {
      fs.mkdirSync(options.userDataDir, { recursive: true })
    }

    const finalArgs: string[] = [
      `--user-data-dir=${options.userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-blink-features=AutomationControlled'
    ]

    if (options.viewport) {
      finalArgs.push(`--window-size=${options.viewport.width},${options.viewport.height}`)
    }

    if (options.cdpPort !== undefined) {
      finalArgs.push(`--remote-debugging-port=${options.cdpPort}`)
    }

    if (options.proxyServer) {
      finalArgs.push(`--proxy-server=${options.proxyServer}`)
    }

    if (options.headless) {
      finalArgs.push('--headless=new')
    }

    if (options.args && options.args.length > 0) {
      finalArgs.push(...options.args)
    }

    const child = spawn(options.executablePath, finalArgs, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    if (!child.pid) {
      throw new Error('Failed to spawn Donut Browser process (PID is undefined)')
    }

    return {
      pid: child.pid,
      profileId: options.profileId,
      browserId: options.browserId,
      engine: 'donut',
      startedAt: new Date(),
      process: child,
      cdpPort: options.cdpPort,
      userDataDir: options.userDataDir
    }
  }

  public async close(pid: number): Promise<void> {
    await killProcessTree(pid, true)
  }

  public supports(): BrowserCapabilities {
    return {
      cdp: true,
      extensions: true,
      customArgs: true,
      incognito: true,
      headless: true
    }
  }
}
