import { app } from 'electron'
import { StorageManager } from './infrastructure/storage/StorageManager'
import { runMigrations } from './infrastructure/database/migrator'
import { closeDatabase } from './infrastructure/database/connection'
import { Logger } from './core/Logger'
import { registerSystemIpc } from './presentation/ipc/system.ipc'
import { registerBrowserIpc } from './presentation/ipc/browser.ipc'
import { BrowserProcessManager } from './modules/browser/BrowserProcessManager'

export function initializePlatform(): void {
  const logger = Logger.getInstance()
  logger.info('Platform', 'Initializing Browser Profile Management Platform...')

  // 1. Khởi tạo cấu trúc thư mục dữ liệu
  const storage = StorageManager.getInstance()
  storage.ensureDirectoryTree()
  logger.info('Platform', `Storage root initialized at: ${storage.getRootPath()}`)

  // 2. Tự động áp dụng Drizzle migrations
  try {
    runMigrations()
    logger.info('Platform', 'Database migrations applied successfully.')
  } catch (err) {
    logger.error('Platform', 'Failed to apply database migrations:', err)
  }

  // 3. Đăng ký các kênh IPC
  registerSystemIpc()
  registerBrowserIpc()
  logger.info('Platform', 'System & Browser IPC registered.')

  // 4. Dọn dẹp cơ sở dữ liệu và tiến trình khi đóng ứng dụng
  app.on('before-quit', async () => {
    logger.info('Platform', 'Stopping all running browser processes...')
    try {
      await BrowserProcessManager.getInstance().stopAll()
    } catch {
      // ignore
    }
    logger.info('Platform', 'Closing database connection before app quit...')
    closeDatabase()
  })
}
