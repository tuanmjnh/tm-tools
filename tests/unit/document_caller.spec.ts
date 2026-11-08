import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { H3Event } from 'h3'

// The handler relies on Nitro's auto-imported `createError`; the unit runner has
// no Nitro, so provide the same shape (status + message) before the module loads.
interface ErrorInput {
  statusCode?: number
  statusMessage?: string
  message?: string
}

globalThis.createError = ((input: ErrorInput) => {
  const error = new Error(input.message ?? input.statusMessage ?? 'error') as Error & ErrorInput
  error.statusCode = input.statusCode
  error.statusMessage = input.statusMessage
  return error
}) as unknown as typeof globalThis.createError

const { documentCaller } = await import('../../server/utils/documentApi')

function eventWithAuth(auth: unknown): H3Event {
  return { context: { auth } } as unknown as H3Event
}

function is401(error: unknown): boolean {
  return (error as { statusCode?: number }).statusCode === 401
}

describe('document caller identity', () => {
  it('reads the subject the Hub actually signs (`sub`)', () => {
    const caller = documentCaller(eventWithAuth({ sub: 'hub-user-1', appId: 'tm-tools' }))
    assert.equal(caller.ownerId, 'hub-user-1')
    assert.equal(caller.tenantId, 'tm-tools')
  })

  it('still accepts a locally minted payload (`userId`)', () => {
    const caller = documentCaller(eventWithAuth({ userId: 'local-user-1', appId: 'tm-tools' }))
    assert.equal(caller.ownerId, 'local-user-1')
  })

  it('refuses a token that names no subject', () => {
    assert.throws(() => documentCaller(eventWithAuth({ appId: 'tm-tools' })), is401)
  })

  it('refuses a request the auth middleware never annotated', () => {
    assert.throws(() => documentCaller(eventWithAuth(undefined)), is401)
  })
})
