import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { H3Event } from 'h3'

/**
 * The app-local AI connection endpoints write provider credentials and can
 * point a connection at any host, so authorization is the guard itself: a
 * non-root account must be refused before any store or provider call happens.
 *
 * Nitro globals are stubbed because this spec imports route modules outside a
 * Nuxt runtime; the store is never reached, so no database is needed.
 */
interface ErrorInput {
  statusCode?: number
  statusMessage?: string
  message?: string
}

const globals = globalThis as unknown as Record<string, unknown>
globals.createError = (input: ErrorInput) => {
  const error = new Error(input.message ?? input.statusMessage ?? 'error') as Error & ErrorInput
  error.statusCode = input.statusCode
  error.statusMessage = input.statusMessage
  return error
}
globals.defineEventHandler = (handler: unknown) => handler

function eventWith(auth: unknown): H3Event {
  return { context: { auth } } as unknown as H3Event
}

const handlers = [
  'server/api/v1/ai/connections/index.get.ts',
  'server/api/v1/ai/connections/index.put.ts',
  'server/api/v1/ai/connections/[connectionId].delete.ts',
  'server/api/v1/ai/connections/[connectionId]/test.post.ts',
  'server/api/v1/ai/connections/[connectionId]/models/refresh.post.ts',
  'server/api/v1/ai/local-connections.get.ts'
]

type Handler = (event: H3Event) => Promise<unknown>

async function loadHandler(path: string): Promise<Handler> {
  const mod = await import(`../../${path}`)
  return mod.default as Handler
}

describe('app-local AI connection endpoints are root-only', () => {
  for (const path of handlers) {
    it(`refuses a non-root caller on ${path}`, async () => {
      const handler = await loadHandler(path)
      await assert.rejects(
        () => handler(eventWith({ sub: 'user-1', roles: ['editor'], permissions: ['chat.write'] })),
        (err: { statusCode?: number, statusMessage?: string }) =>
          err.statusCode === 403 && err.statusMessage === 'error.notRoot'
      )
    })

    it(`refuses a caller with no claims on ${path}`, async () => {
      const handler = await loadHandler(path)
      await assert.rejects(
        () => handler(eventWith(undefined)),
        (err: { statusCode?: number, statusMessage?: string }) =>
          err.statusCode === 401 && err.statusMessage === 'error.tokenMissing'
      )
    })
  }
})
