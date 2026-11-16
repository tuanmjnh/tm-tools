/**
 * Text transformations for the utilities pages.
 *
 * The implementations live in `@tuanmjnh/tm-core` so a script, a worker or a
 * server route can use them without pulling in Vue. This file keeps the names
 * the pages already call (`toSlug`, `encodeBase64`, …) so no template changes.
 */
import {
  toUpperCase,
  toLowerCase,
  toCapitalize,
  toSentenceCase,
  toCamelCase,
  toPascalCase,
  toKebabCase,
  toSnakeCase,
  toConstantCase,
  toAlternatingCase,
  toInverseCase,
  removeVietnameseAccents,
  slugify,
  cleanSpaces,
  removeEmptyLines,
  removeDuplicateLines,
  sortLinesAsc,
  sortLinesDesc,
  reverseLines,
  reverseCharacters,
  numberLines,
  encodeBase64Safe,
  decodeBase64Safe,
  encodeUrlSafe,
  decodeUrlSafe,
  escapeHtmlSafe,
  unescapeHtmlSafe,
  countStats
} from '@tuanmjnh/tm-core'

export type { TextStats } from '@tuanmjnh/tm-core'

export function useTextTransform() {
  return {
    toUpperCase,
    toLowerCase,
    toCapitalize,
    toSentenceCase,
    toCamelCase,
    toPascalCase,
    toKebabCase,
    toSnakeCase,
    toConstantCase,
    toAlternatingCase,
    toInverseCase,
    removeVietnameseAccents,
    // The pages call this `toSlug`; tm-core names it `slugify` because its
    // slug/ module already exports a different toSlug.
    toSlug: slugify,
    cleanSpaces,
    removeEmptyLines,
    removeDuplicateLines,
    sortLinesAsc,
    sortLinesDesc,
    reverseLines,
    reverseCharacters,
    numberLines,
    // Lenient codecs: the utility treats unencodable input as passthrough.
    encodeBase64: encodeBase64Safe,
    decodeBase64: decodeBase64Safe,
    encodeUrl: encodeUrlSafe,
    decodeUrl: decodeUrlSafe,
    escapeHtml: escapeHtmlSafe,
    unescapeHtml: unescapeHtmlSafe,
    countStats
  }
}
