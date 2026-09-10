import { z } from 'zod'
import { registerIpcHandler } from './ipcHelper'
import {
  AddCustomBrowserInputSchema,
  TestExecutableInputSchema,
  type AddCustomBrowserInput,
  type BrowserItem,
  type TestExecutableInput,
  type TestExecutableResult
} from '../../../../shared/contracts/browser.ipc'
import { BrowserManager } from '../../modules/browser/BrowserManager'

export function registerBrowserIpc(): void {
  const browserManager = BrowserManager.getInstance()

  registerIpcHandler<undefined, BrowserItem[]>('browser:list', null, () => {
    return browserManager.listBrowsers()
  })

  registerIpcHandler<undefined, BrowserItem[]>('browser:detect', null, async () => {
    return await browserManager.detectBrowsers()
  })

  registerIpcHandler<AddCustomBrowserInput, BrowserItem>(
    'browser:addCustom',
    AddCustomBrowserInputSchema,
    async (input) => {
      return await browserManager.addCustomBrowser(input)
    }
  )

  registerIpcHandler<{ id: string }, undefined>(
    'browser:remove',
    z.object({ id: z.string().min(1) }),
    (input) => {
      browserManager.removeBrowser(input.id)
    }
  )

  registerIpcHandler<TestExecutableInput, TestExecutableResult>(
    'browser:testExecutable',
    TestExecutableInputSchema,
    async (input) => {
      return await browserManager.testExecutable(input.executablePath)
    }
  )
}
