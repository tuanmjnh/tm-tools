import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { IBrowserAdapter, DetectionResult } from '../../../domain/browser/BrowserAdapter'
import type { BrowserProcess, LaunchOptions } from '../../../domain/browser/BrowserProcess'
import type { BrowserCapabilities, BrowserEngine } from '../../../../../shared/contracts/browser.ipc'
import { getExecutableVersion, killProcessTree, getConfiguredPath } from './browserUtils'

export class ChromiumBrowserAdapter implements IBrowserAdapter {
  public readonly id = 'chromium-adapter'
  public readonly name = 'Chromium Adapter'
  public readonly engine: BrowserEngine = 'chromium'

  public async detect(): Promise<DetectionResult[]> {
    const results: DetectionResult[] = []

    const configuredPath = getConfiguredPath('CHROME_PATH')
    if (configuredPath && fs.existsSync(configuredPath)) {
      try {
        const version = await this.getVersion(configuredPath)
        results.push({
          installed: true,
          name: 'Google Chrome (Configured)',
          path: configuredPath,
          version,
          engine: 'chromium'
        })
      } catch {
        // ignore
      }
    }

    const candidates: Array<{ name: string, paths: string[] }> = []

    if (process.platform === 'win32') {
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
      const localAppData = process.env.LOCALAPPDATA || ''

      candidates.push(
        {
          name: 'Google Chrome',
          paths: [
            path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
          ]
        },
        {
          name: 'Microsoft Edge',
          paths: [
            path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
          ]
        },
        {
          name: 'Brave Browser',
          paths: [
            path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
            path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
          ]
        }
      )
    } else if (process.platform === 'darwin') {
      candidates.push(
        {
          name: 'Google Chrome',
          paths: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        },
        {
          name: 'Microsoft Edge',
          paths: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
        },
        {
          name: 'Brave Browser',
          paths: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']
        }
      )
    } else {
      candidates.push(
        {
          name: 'Google Chrome',
          paths: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
        },
        {
          name: 'Chromium',
          paths: ['/usr/bin/chromium', '/usr/bin/chromium-browser']
        }
      )
    }

    for (const item of candidates) {
      for (const exePath of item.paths) {
        if (fs.existsSync(exePath)) {
          try {
            const version = await this.getVersion(exePath)
            results.push({
              installed: true,
              name: item.name,
              path: exePath,
              version,
              engine: 'chromium'
            })
            // Chỉ lấy 1 path đầu tiên tìm thấy cho mỗi tên browser
            break
          } catch {
            // bỏ qua nếu lỗi đọc version
          }
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
      throw new Error(`Không tìm thấy executable trình duyệt: ${options.executablePath}`)
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
      '--disable-features=Translate',
      '--disable-component-update'
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
      throw new Error('Không thể khởi tạo tiến trình trình duyệt (PID is undefined)')
    }

    return {
      pid: child.pid,
      profileId: options.profileId,
      browserId: options.browserId,
      engine: 'chromium',
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
