/**
 * Hub settings page — device credential surface.
 *
 * Pins what P2/P3 changed:
 *  - "Forget device" is a LOCAL action: it calls the broker without a token and
 *    never claims only a root can do it (revoking on the Hub is a separate,
 *    root-only Hub API action);
 *  - a credential issued by another Hub is shown as such, and the user is sent
 *    to sign in against the current Hub rather than told their session expired;
 *  - the page never renders the device secret.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const page = readFileSync(join(root, 'app/pages/system/settings/hub.vue'), 'utf8')

describe('hub settings — local forget', () => {
  it('calls forget without an access token', () => {
    assert.ok(page.includes('window.electronAPI.device.forget()'), 'forget must not send a token')
    assert.equal(page.includes('device.forget(currentAccessToken())'), false, 'the local gate is gone')
  })

  it('does not report notRoot for a local forget', () => {
    const forgetBody = page.slice(page.indexOf('async function forgetDevice'))
    const end = forgetBody.indexOf('\n}', 40)
    assert.equal(forgetBody.slice(0, end).includes('notRoot'), false, 'a local forget cannot fail on root')
  })

  it('still gates configuration saves on a root session', () => {
    assert.ok(page.includes('result?.code === \'notRoot\''), 'set-config stays root-gated')
  })

  it('never references the device secret slot', () => {
    assert.equal(/HUB_DEVICE_SECRET/.test(page), false, 'the page must never touch the secret')
  })
})

describe('hub settings — credential scope', () => {
  it('compares the issuing Hub against the current one', () => {
    assert.ok(page.includes('hubOrigin'), 'metadata carries the issuing Hub')
    assert.ok(page.includes('credentialForeign'), 'a mismatch must be computed')
  })

  it('offers sign-in to re-enroll instead of deleting the credential', () => {
    assert.ok(page.includes('t(\'settings.hub.reEnroll\')'), 're-enroll copy is reachable')
    assert.ok(page.includes('to="/login"'), 're-enroll goes through a real sign-in')
  })
})
