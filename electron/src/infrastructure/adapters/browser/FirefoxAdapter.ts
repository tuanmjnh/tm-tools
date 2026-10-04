import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { IBrowserAdapter, DetectionResult } from '../../../domain/browser/BrowserAdapter'
import type { BrowserProcess, LaunchOptions } from '../../../domain/browser/BrowserProcess'
import type { BrowserCapabilities, BrowserEngine } from '../../../../../shared/contracts/browser.ipc'
import { getExecutableVersion, killProcessTree, getConfiguredPath } from './browserUtils'

export class FirefoxBrowserAdapter implements IBrowserAdapter {
  public readonly id = 'firefox-adapter'
  public readonly name = 'Firefox Adapter'
  public readonly engine: BrowserEngine = 'firefox'

  public async detect(): Promise<DetectionResult[]> {
    const results: DetectionResult[] = []
    const paths: string[] = []

    const configuredPath = getConfiguredPath('FIREFOX_PATH')
    if (configuredPath && fs.existsSync(configuredPath)) {
      try {
        const version = await this.getVersion(configuredPath)
        results.push({
          installed: true,
          name: 'Mozilla Firefox (Configured)',
          path: configuredPath,
          version,
          engine: 'firefox'
        })
      } catch {
        // ignore
      }
    }

    if (process.platform === 'win32') {
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
      paths.push(
        path.join(programFiles, 'Mozilla Firefox', 'firefox.exe'),
        path.join(programFilesX86, 'Mozilla Firefox', 'firefox.exe')
      )
    } else if (process.platform === 'darwin') {
      paths.push('/Applications/Firefox.app/Contents/MacOS/firefox')
    } else {
      paths.push('/usr/bin/firefox')
    }

    for (const exePath of paths) {
      if (fs.existsSync(exePath)) {
        try {
          const version = await this.getVersion(exePath)
          results.push({
            installed: true,
            name: 'Mozilla Firefox',
            path: exePath,
            version,
            engine: 'firefox'
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
      throw new Error(`Firefox executable not found: ${options.executablePath}`)
    }

    if (!fs.existsSync(options.userDataDir)) {
      fs.mkdirSync(options.userDataDir, { recursive: true })
    }

    const finalArgs: string[] = [
      '-profile',
      options.userDataDir,
      '-no-remote',
      '-new-instance'
    ]

    if (options.viewport) {
      finalArgs.push('-width', String(options.viewport.width), '-height', String(options.viewport.height))
    }

    if (options.headless) {
      finalArgs.push('-headless')
    }

    if (options.args && options.args.length > 0) {
      finalArgs.push(...options.args)
    }

    const child = spawn(options.executablePath, finalArgs, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    if (!child.pid) {
      throw new Error('Failed to spawn Firefox process (PID is undefined)')
    }

    return {
      pid: child.pid,
      profileId: options.profileId,
      browserId: options.browserId,
      engine: 'firefox',
      startedAt: new Date(),
      process: child,
      userDataDir: options.userDataDir
    }
  }

  public async close(pid: number): Promise<void> {
    await killProcessTree(pid, true)
  }

  public supports(): BrowserCapabilities {
    return {
      cdp: false,
      extensions: true,
      customArgs: true,
      incognito: true,
      headless: true
    }
  }
}
