/**
 * The desktop vault encrypts every credential slot at rest and masks it from
 * the renderer. The Hub connection added three slots that must join the AI
 * keys: without them the shared JWT secret and the App Secret would sit in
 * userData/config.env as plaintext and travel back to the page unmasked.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { isSecretSlot, SECRET_SLOT_RE } = require('../../electron/tools/secret-slots.cjs')

describe('secret slots — credentials encrypted at rest', () => {
  const secrets = [
    'AI_API_KEY',
    'AI_API_KEY_OPENROUTER',
    'TMCUT_GEMINI_API_KEY',
    'AUTH_JWT_SECRET',
    'AUTH_REFRESH_TOKEN_SECRET',
    'NUXT_HUB_APP_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
    'CLOUDINARY_API_SECRET',
    'FIREBASE_PRIVATE_KEY',
    'WEB_PUSH_PRIVATE_KEY',
    'MONGODB_URI'
  ]
  for (const key of secrets) {
    it(`${key} is a secret slot`, () => {
      assert.equal(isSecretSlot(key), true)
      assert.equal(SECRET_SLOT_RE.test(key), true)
    })
  }

  const plain = [
    'AI_BASE_URL',
    'AI_MODEL',
    'AI_PROVIDER',
    'NUXT_PUBLIC_HUB_URL',
    'NUXT_PUBLIC_HUB_APP_ID',
    'AUTH_PROVIDER',
    'AUTH_ACCESS_TOKEN_EXPIRY',
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'CLOUDINARY_CLOUD_NAME',
    'FIREBASE_PROJECT_ID',
    'WEB_PUSH_PUBLIC_KEY',
    'TOOLS_FFMPEG_PATH',
    'APP_PORT'
  ]
  for (const key of plain) {
    it(`${key} stays readable configuration`, () => {
      assert.equal(isSecretSlot(key), false)
    })
  }

  it('a public slot can never be mistaken for a secret one', () => {
    assert.equal(isSecretSlot('NUXT_PUBLIC_AUTH_JWT_SECRET'), false)
    assert.equal(isSecretSlot('AUTH_JWT_SECRET_HINT'), false)
  })
})
