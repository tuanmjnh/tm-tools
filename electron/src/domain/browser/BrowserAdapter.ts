import type { BrowserCapabilities, BrowserEngine } from '../../../../shared/contracts/browser.ipc'
import type { BrowserProcess, LaunchOptions } from './BrowserProcess'

export interface DetectionResult {
  installed: boolean
  name: string
  path: string
  version: string
  engine: BrowserEngine
}

export interface IBrowserAdapter {
  readonly id: string
  readonly name: string
  readonly engine: BrowserEngine

  detect(): Promise<DetectionResult[]>
  getVersion(executablePath: string): Promise<string>
  launch(options: LaunchOptions): Promise<BrowserProcess>
  close(pid: number): Promise<void>
  supports(): BrowserCapabilities
}
