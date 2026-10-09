import { app, shell } from 'electron'
import path from 'path'
import { registerIpcHandler } from './ipcHelper'
import {
  OpenDirectoryInputSchema,
  type SystemInfoResponse,
  type StorageUsage,
  type OpenDirectoryInput
} from '../../../../shared/contracts/system.ipc'
import { StorageManager } from '../../infrastructure/storage/StorageManager'

export function registerSystemIpc(): void {
  const storage = StorageManager.getInstance()

  registerIpcHandler<undefined, SystemInfoResponse>('system:getInfo', null, () => {
    return {
      version: app ? app.getVersion() : '1.0.0',
      electronVersion: process.versions.electron || 'unknown',
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome || 'unknown',
      platform: process.platform,
      arch: process.arch,
      userDataPath: storage.getRootPath(),
      storageUsage: storage.getStorageUsage()
    }
  })

  registerIpcHandler<undefined, StorageUsage>('system:getStorageUsage', null, () => {
    return storage.getStorageUsage()
  })

  registerIpcHandler<OpenDirectoryInput, undefined>(
    'system:openDirectory',
    OpenDirectoryInputSchema,
    async (input) => {
      let targetPath: string

      switch (input.pathType) {
        case 'userData':
          targetPath = storage.getRootPath()
          break
        case 'profiles':
          targetPath = storage.getProfilesPath()
          break
        case 'logs':
          targetPath = storage.getLogsPath()
          break
        case 'screenshots':
          targetPath = storage.getScreenshotsPath()
          break
        case 'backups':
          targetPath = storage.getBackupsPath()
          break
        case 'database':
          targetPath = storage.getDatabasePath()
          break
        case 'temp':
          targetPath = storage.getTempPath()
          break
      }

      if (input.subPath) {
        targetPath = path.join(targetPath, input.subPath)
      }

      await shell.openPath(targetPath)
    }
  )

  registerIpcHandler<{ title: string; body?: string; icon?: string }, boolean>(
    'system:showNotification',
    null,
    (input) => {
      const { Notification: ElectronNotification } = require('electron')
      if (ElectronNotification && ElectronNotification.isSupported()) {
        const notif = new ElectronNotification({
          title: input?.title || 'TM Tools',
          body: input?.body || '',
          icon: input?.icon
        })
        notif.show()
        return true
      }
      return false
    }
  )
}
