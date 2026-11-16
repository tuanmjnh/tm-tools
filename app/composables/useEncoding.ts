/**
 * Encoding helpers for the utilities pages.
 *
 * The implementations live in `@tuanmjnh/tm-core` so a script, a worker or a
 * server route can use them without pulling in Vue. These are the *strict*
 * versions: invalid input throws, which is what a validator wants. The text
 * utility's lenient variants live in `useTextTransform`.
 */
import {
  encodeBase64,
  decodeBase64,
  encodeUrl,
  decodeUrl,
  escapeHtml,
  unescapeHtml,
  encodeHex,
  decodeHex,
  encodeBinary,
  decodeBinary,
  rot13,
  reverseText,
  md5,
  sha1,
  sha256,
  sha384,
  sha512,
  runHash,
  decodeJwt,
  encodeJwt,
  generateHexKey
} from '@tuanmjnh/tm-core'

export type { HashAlgorithm, JwtDecoded, JwtEncodeOptions } from '@tuanmjnh/tm-core'

export function useEncoding() {
  return {
    encodeBase64,
    decodeBase64,
    encodeUrl,
    decodeUrl,
    escapeHtml,
    unescapeHtml,
    encodeHex,
    decodeHex,
    encodeBinary,
    decodeBinary,
    rot13,
    reverseText,
    md5,
    sha1,
    sha256,
    sha384,
    sha512,
    runHash,
    decodeJwt,
    encodeJwt,
    generateHexKey,
    // The pages call this `generateRandomKey`; tm-core keeps one name.
    generateRandomKey: generateHexKey
  }
}
