import { existsSync } from 'node:fs'
import { exec } from 'node:child_process'
import { platform } from 'node:os'
import { documentCaller, runDocument, documentBody } from '#server/utils/documentApi'
import { isLocalRuntime } from '#server/modules/document/runtime-context'
import { DocumentError } from '#server/modules/document/operations'

interface OpenLocalBody {
  path?: unknown
  reveal?: unknown
}

/**
 * Opens a local file or folder using the OS default application / file explorer.
 * Available only in local/desktop execution (not on serverless/cloud).
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  void caller

  return runDocument(event, async () => {
    if (!isLocalRuntime()) {
      throw new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED', { reason: 'local-only' })
    }

    const body = await documentBody<OpenLocalBody>(event)
    const targetPath = typeof body.path === 'string' ? body.path.trim() : ''
    if (!targetPath || !existsSync(targetPath)) {
      throw new DocumentError('DOCUMENT_OUTPUT_NOT_READY', { path: targetPath })
    }

    const reveal = Boolean(body.reveal)
    const osPlatform = platform()

    await new Promise<void>((resolve, reject) => {
      let command = ''
      if (osPlatform === 'win32') {
        const winPath = targetPath.replace(/\//g, '\\')
        if (reveal) {
          command = `explorer.exe /select,"${winPath}"`
        } else {
          command = `start "" "${winPath}"`
        }
      } else if (osPlatform === 'darwin') {
        if (reveal) {
          command = `open -R "${targetPath}"`
        } else {
          command = `open "${targetPath}"`
        }
      } else {
        // Linux / other
        command = `xdg-open "${targetPath}"`
      }

      exec(command, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })

    return { ok: true, path: targetPath, reveal }
  })
})

