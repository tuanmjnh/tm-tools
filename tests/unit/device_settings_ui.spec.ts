/**
 * Device settings surface (v2).
 *
 * Pins the two rules this page exists for:
 *  - it reads the identity registry through `/auth/user-devices`, never the P4
 *    service-credential `/auth/devices` route;
 *  - it never touches the device secret: the current device id comes from Main
 *    (Electron) or the browser helper, and only metadata is rendered.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const page = read('app/pages/system/settings/devices.vue')
const settingsNav = read('app/composables/useSettingsNav.ts')
const identity = read('app/shared/utils/deviceIdentity.ts')

describe('device settings page', () => {
  it('uses the identity registry namespace, not the service-credential one', () => {
    assert.ok(page.includes('/api/v1/auth/user-devices'), 'must list through /auth/user-devices')
    assert.equal(/['"`]\/api\/v1\/auth\/devices/.test(page), false, 'must not call the P4 credential route')
  })

  it('never renders or requests a device secret', () => {
    assert.equal(/HUB_DEVICE_SECRET/.test(page), false, 'the page must never reference the secret slot')
    assert.equal(/deviceCredential\s*\??\.\s*secret/.test(page), false, 'the page must never read credential.secret')
  })

  it('resolves the current device from Main first, then the browser helper', () => {
    assert.ok(page.includes('window.electronAPI?.deviceAuth'), 'must ask Main for the device identity')
    assert.ok(page.includes('browserDeviceInfo'), 'must fall back to the browser identity helper')
  })

  it('offers rename and revoke, and signs out after revoking this device', () => {
    assert.ok(page.includes('method: \'PATCH\''), 'rename drives the PATCH endpoint')
    assert.ok(page.includes('method: \'DELETE\''), 'revoke drives the DELETE endpoint')
    assert.ok(page.includes('target.isCurrent'), 'a current-device revoke must be detected')
    assert.ok(page.includes('auth.logout()'), 'a current-device revoke must end the local session')
  })

  it('is reachable from the settings navigation', () => {
    assert.ok(settingsNav.includes('/system/settings/devices'), 'settings nav must link the page')
  })
})

describe('browser device identity', () => {
  it('stores a versioned UUID and never fingerprints', () => {
    assert.ok(identity.includes('tm.device.identity.v1'), 'stable storage key')
    assert.ok(identity.includes('crypto.randomUUID'), 'id comes from randomUUID')
    assert.equal(/userAgent|canvas|webgl/i.test(identity), false, 'no fingerprinting signals')
  })
})
