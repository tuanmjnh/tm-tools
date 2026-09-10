import fs from 'fs'
import path from 'path'
import { StorageManager } from '../infrastructure/storage/StorageManager'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  category: string
  message: string
  details?: unknown
}

export class Logger {
  private static instance: Logger | null = null
  private readonly logFilePath: string

  private constructor() {
    const storage = StorageManager.getInstance()
    this.logFilePath = path.join(storage.getLogsPath(), 'app.log')
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  private write(level: LogLevel, category: string, message: string, details?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details
    }

    const logLine = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}${entry.details ? ' ' + JSON.stringify(entry.details) : ''}\n`

    // In ra console
    if (level === 'error') {
      console.error(logLine.trim())
    } else if (level === 'warn') {
      console.warn(logLine.trim())
    } else {
      console.log(logLine.trim())
    }

    // Ghi vào file log
    try {
      fs.appendFileSync(this.logFilePath, logLine, 'utf8')
    } catch {
      // bỏ qua nếu lỗi ghi file
    }
  }

  public debug(category: string, message: string, details?: unknown): void {
    this.write('debug', category, message, details)
  }

  public info(category: string, message: string, details?: unknown): void {
    this.write('info', category, message, details)
  }

  public warn(category: string, message: string, details?: unknown): void {
    this.write('warn', category, message, details)
  }

  public error(category: string, message: string, details?: unknown): void {
    this.write('error', category, message, details)
  }
}
