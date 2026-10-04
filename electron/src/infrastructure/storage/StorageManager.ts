import path from 'path'
import fs from 'fs'
import type { StorageUsage } from '../../../shared/contracts/system.ipc'

function getAppUserDataPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron')
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData')
    }
  } catch {
    // Not running in Electron (e.g. Unit test / CLI)
  }
  return path.resolve(process.env.APPDATA || './', 'tm-tools')
}

export class StorageManager {
  private static instance: StorageManager | null = null
  private readonly rootDir: string

  private constructor() {
    this.rootDir = getAppUserDataPath()
    this.ensureDirectoryTree()
  }

  public static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager()
    }
    return StorageManager.instance
  }

  public getRootPath(): string {
    return this.rootDir
  }

  public getDatabasePath(): string {
    return path.join(this.rootDir, 'database')
  }

  public getProfilesPath(): string {
    return path.join(this.rootDir, 'profiles')
  }

  public getDownloadsPath(): string {
    return path.join(this.rootDir, 'downloads')
  }

  public getScreenshotsPath(): string {
    return path.join(this.rootDir, 'screenshots')
  }

  public getLogsPath(): string {
    return path.join(this.rootDir, 'logs')
  }

  public getBackupsPath(): string {
    return path.join(this.rootDir, 'backups')
  }

  public getTempPath(): string {
    return path.join(this.rootDir, 'temp')
  }

  public getProfileStoragePath(profileId: string): string {
    const profileDir = path.join(this.getProfilesPath(), profileId)
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true })
    }
    return profileDir
  }

  public ensureDirectoryTree(): void {
    const dirs = [
      this.getDatabasePath(),
      this.getProfilesPath(),
      this.getDownloadsPath(),
      this.getScreenshotsPath(),
      this.getLogsPath(),
      this.getBackupsPath(),
      this.getTempPath()
    ]

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  public getStorageUsage(): StorageUsage {
    const getFolderSize = (folderPath: string): number => {
      if (!fs.existsSync(folderPath)) return 0
      let total = 0
      try {
        const files = fs.readdirSync(folderPath, { withFileTypes: true })
        for (const file of files) {
          const fullPath = path.join(folderPath, file.name)
          if (file.isDirectory()) {
            total += getFolderSize(fullPath)
          } else if (file.isFile()) {
            total += fs.statSync(fullPath).size
          }
        }
      } catch {
        // ignore read error
      }
      return total
    }

    const databaseBytes = getFolderSize(this.getDatabasePath())
    const profilesBytes = getFolderSize(this.getProfilesPath())
    const logsBytes = getFolderSize(this.getLogsPath())
    const screenshotsBytes = getFolderSize(this.getScreenshotsPath())
    const tempBytes = getFolderSize(this.getTempPath())
    const totalBytes = databaseBytes + profilesBytes + logsBytes + screenshotsBytes + tempBytes

    return {
      databaseBytes,
      profilesBytes,
      logsBytes,
      screenshotsBytes,
      tempBytes,
      totalBytes
    }
  }
}
