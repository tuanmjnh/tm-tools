const FORBIDDEN_CHARS = '\\/:*?"<>|'

function stripUnsafeChars(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || FORBIDDEN_CHARS.includes(char)) continue
    out += char
  }
  return out
}

/**
 * Reduces any user-supplied path to a single on-disk name. Directory
 * separators are stripped (not resolved) so `../../x` can never escape the
 * workspace root.
 */
export function safeFileName(raw: string): string {
  const base = String(raw ?? '').split(/[\\/]/).pop() || ''
  const cleaned = stripUnsafeChars(base)
    .trim()
    .replace(/^\.+/, '')
    .trim()

  if (!cleaned) {
    throw new Error('PDF_NAME_REQUIRED')
  }
  return cleaned.slice(0, 180)
}

export function safeStem(raw: string): string {
  const name = safeFileName(raw)
  return name.replace(/\.pdf$/i, '') || name
}

/**
 * Validates a relative subpath (e.g. `nested/sub/file.pdf` or `nested/sub`)
 * so it stays strictly within the root directory and cannot traverse outside.
 * Returns normalized relative path with forward slashes, or empty string for root.
 */
export function safeRelativePath(raw: string): string {
  const parts = String(raw ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map(p => p.trim())
    .filter(Boolean)

  const sanitizedParts: string[] = []
  for (const part of parts) {
    if (part === '.' || part === '..') {
      throw new Error('PDF_INVALID_PATH')
    }
    const clean = stripUnsafeChars(part).trim().replace(/^\.+/, '').trim()
    if (!clean) {
      throw new Error('PDF_INVALID_PATH')
    }
    sanitizedParts.push(clean.slice(0, 180))
  }

  return sanitizedParts.join('/')
}

/** Extension-free name shared by a document and everything derived from it. */

export function documentStem(raw: string): string {
  const name = safeFileName(raw)
  return name.replace(/\.(pdf|docx|doc)$/i, '') || name
}

export function isPdfName(name: string): boolean {
  return /\.pdf$/i.test(name)
}

export function isImageName(name: string): boolean {
  return /\.(png|jpe?g)$/i.test(name)
}

/**
 * Anything the import workspace can turn into a PDF: images and tabular /
 * office documents. PDFs are handled by `isPdfName` and never land here.
 */
export function isInputName(name: string): boolean {
  return /\.(png|jpe?g|docx|xlsx|csv|json|xml)$/i.test(name)
}

export function isWordName(name: string): boolean {
  return /\.docx$/i.test(name)
}

/** Legacy .doc cannot be read by mammoth; reject it with its own code. */
export function isLegacyWordName(name: string): boolean {
  return /\.doc$/i.test(name)
}

export function isOfficeName(name: string): boolean {
  return /\.(docx|xlsx)$/i.test(name)
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
