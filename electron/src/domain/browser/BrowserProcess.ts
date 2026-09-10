import type { ChildProcess } from 'child_process'
import type { BrowserEngine } from '../../../../shared/contracts/browser.ipc'

export interface LaunchOptions {
  executablePath: string
  userDataDir: string
  profileId: string
  browserId: string
  engine: BrowserEngine
  args?: string[]
  viewport?: { width: number, height: number }
  cdpPort?: number
  proxyServer?: string
  headless?: boolean
}

export interface BrowserProcess {
  pid: number
  profileId: string
  browserId: string
  engine: BrowserEngine
  startedAt: Date
  process: ChildProcess
  cdpPort?: number
  userDataDir: string
}
