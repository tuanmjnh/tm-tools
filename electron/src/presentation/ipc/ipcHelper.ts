import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import { ok, fail, type ApiResponse } from '../../../../shared/contracts/common'
import { Logger } from '../../core/Logger'

export function registerIpcHandler<TInput, TOutput>(
  channel: string,
  schema: z.ZodType<TInput> | null,
  handler: (input: TInput, event: IpcMainInvokeEvent) => Promise<TOutput> | TOutput
): void {
  const logger = Logger.getInstance()

  ipcMain.handle(channel, async (event, rawInput): Promise<ApiResponse<TOutput>> => {
    let validatedInput = rawInput as TInput

    if (schema) {
      const parsed = schema.safeParse(rawInput)
      if (!parsed.success) {
        logger.warn('IPC', `Validation failed on channel "${channel}":`, parsed.error.issues)
        return fail<TOutput>(
          'VALIDATION_ERROR',
          `Input validation failed for channel "${channel}"`,
          parsed.error.issues
        )
      }
      validatedInput = parsed.data
    }

    try {
      const result = await handler(validatedInput, event)
      return ok<TOutput>(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('IPC', `Error handling channel "${channel}": ${message}`, err)
      return fail<TOutput>('HANDLER_ERROR', message)
    }
  })
}
