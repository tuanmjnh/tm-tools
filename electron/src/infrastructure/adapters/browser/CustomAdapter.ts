import { spawn } from 'child_process'
import fs from 'fs'
import type { IBrowserAdapter, DetectionResult } from '../../../domain/browser/BrowserAdapter'
import type { BrowserProcess, LaunchOptions } from '../../../domain/browser/BrowserProcess'
import type { BrowserCapabilities, BrowserEngine } from '../../../../../shared/contracts/browser.ipc'
import { getExecutableVersion, killProcessTree } from './browserUtils'

export class CustomBrowserAdapter implements IBrowserAdapter {
  public readonly id = 'custom-adapter'
  public readonly name = 'Custom Executable Adapter'
  public readonly engine: BrowserEngine = 'custom'

  public async detect(): Promise<DetectionResult[]> {
    // Custom adapter relies on user-provided path rather than auto-detection
    return []
  }

  public async getVersion(executablePath: string): Promise<string> {
    return getExecutableVersion(executablePath)
  }

  public async launch(options: LaunchOptions): Promise<BrowserProcess> {
    if (!fs.existsSync(options.executablePath)) {
      throw new Error(`Custom executable not found: ${options.executablePath}`)
    }

    if (!fs.existsSync(options.userDataDir)) {
      fs.mkdirSync(options.userDataDir, { recursive: true })
    }

    // If engine is firefox use firefox flags, otherwise default to chromium flags
    const isFirefox = options.engine === 'firefox'
    const finalArgs: string[] = isFirefox
      ? ['-profile', options.userDataDir, '-no-remote']
      : [`--user-data-dir=${options.userDataDir}`, '--no-first-run', '--no-default-browser-check']

    if (options.viewport) {
      if (isFirefox) {
        finalArgs.push('-width', String(options.viewport.width), '-height', String(options.viewport.height))
      } else {
        finalArgs.push(`--window-size=${options.viewport.width},${options.viewport.height}`)
      }
    }

    if (!isFirefox && options.cdpPort !== undefined) {
      finalArgs.push(`--remote-debugging-port=${options.cdpPort}`)
    }

    if (!isFirefox && options.proxyServer) {
      finalArgs.push(`--proxy-server=${options.proxyServer}`)
    }

    if (options.args && options.args.length > 0) {
      finalArgs.push(...options.args)
    }

    const child = spawn(options.executablePath, finalArgs, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    if (!child.pid) {
      throw new Error('Failed to spawn Custom Browser process (PID is undefined)')
    }

    return {
      pid: child.pid,
      profileId: options.profileId,
      browserId: options.browserId,
      engine: options.engine,
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
