import { EventEmitter } from 'events'
import type { EventBusContracts } from '../../../shared/contracts/events'

interface ElectronWindowLike {
  isDestroyed: () => boolean
  webContents?: {
    send: (channel: string, data: unknown) => void
  }
}

function getBrowserWindows(): ElectronWindowLike[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BrowserWindow } = require('electron')
    if (BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
      return BrowserWindow.getAllWindows()
    }
  } catch {
    // Ngoài môi trường Electron
  }
  return []
}

export class EventBus extends EventEmitter {
  private static instance: EventBus | null = null

  private constructor() {
    super()
    this.setMaxListeners(50)
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus()
    }
    return EventBus.instance
  }

  public emitDomain<K extends keyof EventBusContracts>(
    event: K,
    payload: EventBusContracts[K]
  ): boolean {
    // 1. Emit nội bộ trong Electron Main Process
    const localResult = super.emit(event, payload)

    // 2. Broadcast sang toàn bộ BrowserWindow Renderer Process
    try {
      const windows = getBrowserWindows()
      for (const win of windows) {
        if (!win.isDestroyed() && win.webContents) {
          win.webContents.send('eventbus:event', { event, payload })
        }
      }
    } catch (err) {
      console.error(`[EventBus] Failed to broadcast event "${event}" to renderer:`, err)
    }

    return localResult
  }

  public onDomain<K extends keyof EventBusContracts>(
    event: K,
    listener: (payload: EventBusContracts[K]) => void
  ): this {
    return super.on(event, listener)
  }

  public offDomain<K extends keyof EventBusContracts>(
    event: K,
    listener: (payload: EventBusContracts[K]) => void
  ): this {
    return super.off(event, listener)
  }
}
