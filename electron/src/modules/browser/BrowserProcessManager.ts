import type { BrowserProcess } from '../../domain/browser/BrowserProcess'
import { EventBus } from '../../core/EventBus'
import { Logger } from '../../core/Logger'
import { killProcessTree } from '../../infrastructure/adapters/browser/browserUtils'

export class BrowserProcessManager {
  private static instance: BrowserProcessManager | null = null
  // Map stored by profileId
  private readonly runningProcesses = new Map<string, BrowserProcess>()
  // Reverse lookup map by PID
  private readonly pidToProfileId = new Map<number, string>()
  private readonly eventBus: EventBus
  private readonly logger: Logger

  private constructor() {
    this.eventBus = EventBus.getInstance()
    this.logger = Logger.getInstance()
  }

  public static getInstance(): BrowserProcessManager {
    if (!BrowserProcessManager.instance) {
      BrowserProcessManager.instance = new BrowserProcessManager()
    }
    return BrowserProcessManager.instance
  }

  public registerProcess(processInfo: BrowserProcess): void {
    const { profileId, pid, browserId, process } = processInfo

    this.runningProcesses.set(profileId, processInfo)
    this.pidToProfileId.set(pid, profileId)

    this.logger.info('BrowserProcess', `Browser process started for profile [${profileId}] with PID [${pid}]`)

    // Emit started event
    this.eventBus.emitDomain('browser:started', { browserId, pid })
    this.eventBus.emitDomain('profile:started', { profileId, pid, startedAt: processInfo.startedAt.getTime() })

    // Listen for process exit
    process.once('exit', (code, signal) => {
      this.logger.info('BrowserProcess', `Browser process PID [${pid}] exited with code: ${code}, signal: ${signal}`)
      this.cleanupProcess(profileId, pid)

      this.eventBus.emitDomain('browser:closed', { browserId, pid })

      // If crashed (non-zero exit code and not actively killed)
      if (code !== 0 && code !== null) {
        this.eventBus.emitDomain('profile:crashed', {
          profileId,
          error: `Process terminated abnormally with exit code ${code}`
        })
      } else {
        this.eventBus.emitDomain('profile:stopped', { profileId, exitCode: code })
      }
    })

    // Listen for error events
    process.once('error', (err) => {
      this.logger.error('BrowserProcess', `Error on browser process PID [${pid}]: ${err.message}`, err)
      this.cleanupProcess(profileId, pid)

      this.eventBus.emitDomain('profile:crashed', {
        profileId,
        error: err.message
      })
    })
  }

  private cleanupProcess(profileId: string, pid: number): void {
    this.runningProcesses.delete(profileId)
    this.pidToProfileId.delete(pid)
  }

  public getRunningProcess(profileId: string): BrowserProcess | undefined {
    return this.runningProcesses.get(profileId)
  }

  public getProcessByPid(pid: number): BrowserProcess | undefined {
    const profileId = this.pidToProfileId.get(pid)
    return profileId ? this.runningProcesses.get(profileId) : undefined
  }

  public isProfileRunning(profileId: string): boolean {
    return this.runningProcesses.has(profileId)
  }

  public getAllRunningProcesses(): BrowserProcess[] {
    return Array.from(this.runningProcesses.values())
  }

  public async stopProcess(profileId: string, timeoutMs = 3000): Promise<void> {
    const proc = this.runningProcesses.get(profileId)
    if (!proc) {
      return
    }

    this.logger.info('BrowserProcess', `Stopping browser for profile [${profileId}], PID [${proc.pid}]...`)

    // Try graceful kill first
    try {
      proc.process.kill('SIGTERM')
    } catch {
      // ignore
    }

    // Wait for process to exit within timeoutMs
    const exited = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs)
      proc.process.once('exit', () => {
        clearTimeout(timer)
        resolve(true)
      })
    })

    // If timed out, forcefully kill the process tree
    if (!exited) {
      this.logger.warn('BrowserProcess', `Graceful shutdown timed out for PID [${proc.pid}], forcing kill...`)
      await killProcessTree(proc.pid, true)
    }

    this.cleanupProcess(profileId, proc.pid)
  }

  public async stopAll(): Promise<void> {
    const profiles = Array.from(this.runningProcesses.keys())
    await Promise.all(profiles.map(profileId => this.stopProcess(profileId)))
  }
}
