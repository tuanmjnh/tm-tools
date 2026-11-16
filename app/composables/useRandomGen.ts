/**
 * Random generators for the utilities pages.
 *
 * The implementations live in `@tuanmjnh/tm-core` so a script, a CLI or a
 * server route can generate a password or a key without pulling in Vue.
 */
import {
  generatePassword,
  generatePasswordBatch,
  generatePin,
  generateUuid,
  generateToken,
  generateApiKey,
  generateUsername,
  generateUsernameBatch,
  generateEmail,
  generateName,
  generateHexKey,
  generateRandomKeyBatch,
  DEFAULT_PASSWORD_OPTIONS
} from '@tuanmjnh/tm-core'

export type { PasswordOptions, UsernameOptions } from '@tuanmjnh/tm-core'

export function useRandomGen() {
  return {
    generatePassword,
    generatePasswordBatch,
    generatePin,
    generateUuid,
    generateToken,
    generateApiKey,
    // tm-core names the single-key generator once, in codec/encoding.ts.
    generateRandomKey: generateHexKey,
    generateRandomKeyBatch,
    generateUsername,
    generateUsernameBatch,
    generateEmail,
    generateName,
    DEFAULT_PASSWORD_OPTIONS
  }
}
