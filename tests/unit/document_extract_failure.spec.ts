import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The page shows `document.errors.<code>`; an unmapped engine error became
// DOCUMENT_PROCESSING_TIMEOUT, so an exhausted token budget told the operator
// "this took too long" and sent them looking at the wrong thing.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const { extractFailureCode } = await import('../../server/modules/document/executors')

describe('extract failure mapping', () => {
  const cases: [string | null | undefined, string][] = [
    ['PDF_AI_NO_MODEL', 'DOCUMENT_AI_MODEL_UNAVAILABLE'],
    ['PDF_AI_KEY_MISSING', 'DOCUMENT_AI_MODEL_UNAVAILABLE'],
    ['PDF_AI_OUTPUT_TRUNCATED', 'DOCUMENT_AI_OUTPUT_TRUNCATED'],
    ['PDF_AI_INVALID_JSON', 'DOCUMENT_AI_INVALID_RESPONSE'],
    ['PDF_AI_INVALID_RESPONSE', 'DOCUMENT_AI_INVALID_RESPONSE'],
    ['PDF_AI_EMPTY_RESPONSE', 'DOCUMENT_AI_EMPTY_RESPONSE'],
    ['PDF_AI_EMPTY_PAGE', 'DOCUMENT_AI_EMPTY_RESPONSE'],
    ['PDF_AI_TIMEOUT', 'DOCUMENT_PROCESSING_TIMEOUT'],
    ['ERROR_AI_RELAY', 'DOCUMENT_AI_RELAY_FAILED'],
    ['ERROR_AI_RELAY_UPSTREAM', 'DOCUMENT_AI_RELAY_FAILED'],
    ['SOMETHING_ELSE', 'DOCUMENT_AI_EXTRACT_FAILED'],
    [null, 'DOCUMENT_AI_EXTRACT_FAILED'],
    [undefined, 'DOCUMENT_AI_EXTRACT_FAILED']
  ]

  for (const [engineCode, expected] of cases) {
    it(`maps ${String(engineCode)} to ${expected}`, () => {
      assert.equal(extractFailureCode(engineCode), expected)
    })
  }

  it('never reports a genuine timeout for a non-timeout engine code', () => {
    // The old code raised this label for every failure, which is what made the
    // report misleading.
    for (const [engineCode, expected] of cases) {
      if (expected === 'DOCUMENT_PROCESSING_TIMEOUT') continue
      assert.notEqual(extractFailureCode(engineCode), 'DOCUMENT_PROCESSING_TIMEOUT', String(engineCode))
    }
  })
})

describe('extract failure diagnostics', () => {
  it('labels every new code in both locales', () => {
    const codes = [
      'DOCUMENT_AI_MODEL_UNAVAILABLE',
      'DOCUMENT_AI_OUTPUT_TRUNCATED',
      'DOCUMENT_AI_INVALID_RESPONSE',
      'DOCUMENT_AI_EMPTY_RESPONSE',
      'DOCUMENT_AI_RELAY_FAILED',
      'DOCUMENT_AI_EXTRACT_FAILED'
    ]
    for (const locale of ['en', 'vi']) {
      const errors = JSON.parse(read(`i18n/locales/${locale}.json`)).document.errors
      for (const code of codes) {
        assert.equal(typeof errors[code], 'string', `${locale} is missing ${code}`)
        assert.ok(errors[code].length > 10, `${locale} ${code} is not a real message`)
      }
    }
  })

  it('records engine detail on the journal so a failure is diagnosable', () => {
    const jobs = read('server/modules/pdf/extract/jobs.ts')
    assert.match(jobs, /errorDetail/)
  })

  it('detects a truncated answer from the reported token usage', () => {
    const provider = read('server/modules/pdf/extract/provider.ts')
    assert.match(provider, /PDF_AI_OUTPUT_TRUNCATED/)
    // Truncation is a budget problem, so retrying with the same budget cannot
    // help: it must be classified as non-retryable.
    assert.match(provider, /error\.message === 'PDF_AI_OUTPUT_TRUNCATED'\)\s*return false/)
  })

  it('raises an absolute standard-font path for pdf.js', () => {
    const provider = read('server/modules/pdf/extract/provider.ts')
    assert.match(provider, /standardFontDataUrl/)
    // pdf.js rejects a Windows separator regardless of a trailing slash, so the
    // resolved path has to be normalised before it is handed over.
    assert.ok(
      provider.includes('replace(/\\\\/g, \'/\')'),
      'the standard font path must be normalised to forward slashes'
    )
  })
})
