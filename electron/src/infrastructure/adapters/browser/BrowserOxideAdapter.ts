import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { IBrowserAdapter, DetectionResult } from '../../../domain/browser/BrowserAdapter'
import type { BrowserProcess, LaunchOptions } from '../../../domain/browser/BrowserProcess'
import type { BrowserCapabilities, BrowserEngine } from '../../../../../shared/contracts/browser.ipc'
import { getExecutableVersion, killProcessTree, getConfiguredPath } from './browserUtils'

export class BrowserOxideAdapter implements IBrowserAdapter {
  public readonly id = 'browser-oxide-adapter'
  public readonly name = 'Browser Oxide (Rust Engine)'
  public readonly engine: BrowserEngine = 'browser_oxide'

  public async detect(): Promise<DetectionResult[]> {
    const results: DetectionResult[] = []
    const candidates: string[] = []

    const configuredPath = getConfiguredPath('BROWSER_OXIDE_PATH')
    if (configuredPath) {
      candidates.push(configuredPath)
    }

    if (process.platform === 'win32') {
      const userProfile = process.env.USERPROFILE || ''
      const localAppData = process.env.LOCALAPPDATA || ''
      candidates.push(
        path.join(localAppData, 'browser_oxide', 'browser_oxide.exe'),
        path.join(userProfile, '.cargo', 'bin', 'browser_oxide.exe'),
        path.join(userProfile, '.cargo', 'bin', 'oxide.exe'),
        path.join(process.cwd(), 'resources', 'bin', 'oxide', 'browser_oxide.exe')
      )
    } else {
      candidates.push(
        '/usr/local/bin/browser_oxide',
        '/usr/bin/browser_oxide',
        path.join(process.env.HOME || '', '.cargo', 'bin', 'browser_oxide')
      )
    }

    for (const exePath of candidates) {
      if (fs.existsSync(exePath)) {
        try {
          const version = await this.getVersion(exePath)
          results.push({
            installed: true,
            name: 'Browser Oxide',
            path: exePath,
            version,
            engine: 'browser_oxide'
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
      throw new Error(`Không tìm thấy executable Browser Oxide: ${options.executablePath}`)
    }

    if (!fs.existsSync(options.userDataDir)) {
      fs.mkdirSync(options.userDataDir, { recursive: true })
    }

    const finalArgs: string[] = [
      `--user-data-dir=${options.userDataDir}`,
      '--no-sandbox'
    ]

    if (options.cdpPort !== undefined) {
      finalArgs.push(`--cdp-port=${options.cdpPort}`)
    }

    if (options.proxyServer) {
      finalArgs.push(`--proxy=${options.proxyServer}`)
    }

    if (options.args && options.args.length > 0) {
      finalArgs.push(...options.args)
    }

    const child = spawn(options.executablePath, finalArgs, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    if (!child.pid) {
      throw new Error('Không thể khởi tạo tiến trình Browser Oxide (PID is undefined)')
    }

    return {
      pid: child.pid,
      profileId: options.profileId,
      browserId: options.browserId,
      engine: 'browser_oxide',
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
      incognito: false,
      headless: true
    }
  }
}
