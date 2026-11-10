/**
 * The packaged window treated every same-origin `/api/` popup as a download,
 * including the artifact preview (`?inline=1`), so "Preview" saved a file
 * instead of rendering it. The decision lives in one pure helper so the shell
 * wiring and the contract stay testable without launching Electron.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { decideWindowOpen } = require('../../electron/tools/window-open.cjs') as {
  decideWindowOpen: (input: { url: string, currentUrl?: string | null }) => {
    action: 'external' | 'download' | 'popup' | 'allow' | 'deny'
    pdfPlugins?: boolean
  }
}

const CURRENT = 'http://127.0.0.1:3456/document-studio/tools/images'
const ARTIFACT = '/api/v1/documents/jobs/job-1/artifacts/art-1/download'

describe('window open decisions', () => {
  it('previews a same-origin artifact instead of downloading it', () => {
    const decision = decideWindowOpen({ url: `http://127.0.0.1:3456${ARTIFACT}?inline=1`, currentUrl: CURRENT })
    assert.equal(decision.action, 'popup')
    assert.equal(decision.pdfPlugins, true)
  })

  it('still downloads a same-origin API link without the inline flag', () => {
    assert.equal(decideWindowOpen({ url: `http://127.0.0.1:3456${ARTIFACT}`, currentUrl: CURRENT }).action, 'download')
    assert.equal(decideWindowOpen({ url: `http://127.0.0.1:3456${ARTIFACT}?inline=0`, currentUrl: CURRENT }).action, 'download')
  })

  it('treats other inline API links as previews too', () => {
    assert.equal(decideWindowOpen({ url: `http://127.0.0.1:3456/api/v1/pdf/files/a.pdf?inline=1`, currentUrl: CURRENT }).action, 'popup')
  })

  it('opens OAuth providers in an app popup so the session survives', () => {
    const decision = decideWindowOpen({ url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x', currentUrl: CURRENT })
    assert.equal(decision.action, 'popup')
    assert.notEqual(decision.pdfPlugins, true)
  })

  it('sends other external links to the system browser', () => {
    assert.equal(decideWindowOpen({ url: 'https://example.com/docs', currentUrl: CURRENT }).action, 'external')
    assert.equal(decideWindowOpen({ url: 'https://github.com/login/oauth/authorize', currentUrl: CURRENT }).action, 'popup')
  })

  it('keeps internal app routes in an app window', () => {
    assert.equal(decideWindowOpen({ url: 'http://127.0.0.1:3456/system/settings/hub', currentUrl: CURRENT }).action, 'allow')
  })

  it('never downloads when the caller origin is unknown', () => {
    assert.equal(decideWindowOpen({ url: `http://127.0.0.1:3456${ARTIFACT}?inline=1`, currentUrl: null }).action, 'popup')
    assert.equal(decideWindowOpen({ url: `http://127.0.0.1:3456${ARTIFACT}`, currentUrl: null }).action, 'allow')
  })

  it('survives an unparsable url', () => {
    assert.equal(decideWindowOpen({ url: 'not a url', currentUrl: CURRENT }).action, 'allow')
  })
})
