/**
 * `/health` answers its payload directly, every authenticated route wraps it in
 * `DocumentEnvelope`. Reading `res.data` blindly blanked the Settings page.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const calls: string[] = []

globalThis.$fetch = (async (url: string) => {
  calls.push(url)
  if (url.endsWith('/health')) {
    return {
      runtime: 'local',
      storage: { driver: 'local', persistent: true, requiresSession: false, mode: 'durable', ephemeral: false, configured: true },
      database: { configured: false, connected: false },
      operations: [],
      limits: { maxFileBytes: 1, maxTotalInputBytes: 2, maxInputFiles: 3, maxTempBytes: 4, maxInlineDurationMs: 5 }
    }
  }
  return {
    ok: true,
    data: {
      runtime: 'local',
      defaultOutputPath: 'D:/out',
      delivery: 'folder',
      supportsNativeSaveDialog: false,
      defaultRetentionDays: 7,
      maxRetentionDays: 90
    },
    requestId: 'req-1'
  }
}) as unknown as typeof globalThis.$fetch

const { useDocumentApi } = await import('../../app/composables/useDocumentApi')
const api = useDocumentApi()

describe('document api client', () => {
  it('unwraps the envelope authenticated routes return', async () => {
    const settings = await api.settings()
    assert.equal(settings.delivery, 'folder')
    assert.equal(settings.defaultOutputPath, 'D:/out')
  })

  it('reads the raw payload /health returns without an envelope', async () => {
    const health = await api.health()
    assert.equal(health.storage.driver, 'local')
    assert.equal(health.limits.maxInputFiles, 3)
    assert.equal(calls.at(-1), '/api/v1/documents/health')
  })
})
