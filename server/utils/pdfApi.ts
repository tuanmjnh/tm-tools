export const PDF_ERROR_STATUS: Record<string, number> = {
  PDF_INVALID: 422,
  PDF_INVALID_EXTENSION: 422,
  PDF_EMPTY_UPLOAD: 422,
  PDF_UPLOAD_TOO_LARGE: 413,
  PDF_TOO_MANY_PAGES: 422,
  PDF_SOURCE_NOT_FOUND: 404,
  PDF_OUTPUT_NOT_FOUND: 404,
  PDF_FOLDER_ALREADY_EXISTS: 409,
  PDF_FOLDER_IMMUTABLE: 409,
  PDF_FILE_IMMUTABLE: 409,
  PDF_FILE_ALREADY_EXISTS: 409,
  PDF_FOLDER_NOT_FOUND: 404,
  PDF_RESULT_NOT_FOUND: 404,
  PDF_EMPTY_FOLDER: 422,
  PDF_JOB_RUNNING: 409,
  PDF_JOB_NOT_FOUND: 404,
  PDF_PRESET_NAME_REQUIRED: 422,
  PDF_PRESET_LIMIT: 422,
  PDF_WORD_LEGACY: 422,
  PDF_WORD_INVALID: 422,
  PDF_WORD_NOT_FOUND: 404,
  PDF_OFFICE_NOT_FOUND: 404,
  PDF_FILE_NOT_FOUND: 404,
  PDF_INPUT_INVALID: 422,
  PDF_NAME_REQUIRED: 422,
  PDF_FOLDER_NAME_REQUIRED: 422,
  PDF_INVALID_PATH: 422,
  PDF_INPUT_NOT_FOUND: 404,
  PDF_NO_ROWS: 422,
  PDF_EXPORT_NO_FORMAT: 422,
  PDF_EXPORT_FAILED: 422,
  PDF_TRASH_ITEM_NOT_FOUND: 404,
  PDF_PREVIEW_NEEDS_PDF: 422,
  PDF_FONT_MISSING: 503,
  PDF_AI_KEY_MISSING: 503,
  PDF_AI_TIMEOUT: 504,
  PDF_AI_HTTP_429: 429
}

export function pdfHttpStatus(code: string, fallback = 500): number {
  if (PDF_ERROR_STATUS[code]) return PDF_ERROR_STATUS[code]
  if (code.startsWith('PDF_AI_HTTP_')) return 502
  return fallback
}

/** h3 keeps `%2F` encoded inside one segment, so decode before using it as a path. */
export function pathParam(value: string | null | undefined): string {
  const raw = String(value ?? '')
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** Outputs are replaced by default; only an explicit off keeps the existing file. */
export function overwriteFlag(value: unknown): boolean {
  return value !== false && value !== 'false'
}

function errorCode(error: unknown): string {
  return (error as Error)?.message || 'PDF_UNKNOWN_ERROR'
}

/**
 * Runs a PDF workspace operation and converts module-level error codes into
 * HTTP errors so the client can map them to localized messages.
 */
export async function runPdf<T>(action: () => Promise<T> | T): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    const code = errorCode(error)
    throw createError({
      statusCode: pdfHttpStatus(code),
      statusMessage: code,
      message: code
    })
  }
}
