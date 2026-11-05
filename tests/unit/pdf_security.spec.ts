import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isImageName,
  isPdfName,
  naturalCompare,
  safeFileName,
  safeRelativePath,
  safeStem
} from '../../server/modules/pdf/security'

describe('safeFileName', () => {
  it('keeps a plain name untouched', () => {
    assert.equal(safeFileName('page_0005.pdf'), 'page_0005.pdf')
  })

  it('strips directory segments so traversal cannot escape the root', () => {
    assert.equal(safeFileName('../../etc/passwd'), 'passwd')
    assert.equal(safeFileName('..\\..\\windows\\system32\\x.pdf'), 'x.pdf')
  })

  it('removes forbidden characters and leading dots', () => {
    assert.equal(safeFileName('re:port*?"<>|.pdf'), 'report.pdf')
    assert.equal(safeFileName('.hidden.pdf'), 'hidden.pdf')
  })

  it('removes control characters', () => {
    assert.equal(safeFileName('ba\u0000d\u001f.pdf'), 'bad.pdf')
  })

  it('rejects names that become empty', () => {
    assert.throws(() => safeFileName(''), /PDF_NAME_REQUIRED/)
    assert.throws(() => safeFileName('  ...  '), /PDF_NAME_REQUIRED/)
  })

  it('caps the name at 180 characters', () => {
    assert.equal(safeFileName(`${'a'.repeat(400)}.pdf`).length, 180)
  })
})

describe('safeStem', () => {
  it('drops the .pdf extension for folder names', () => {
    assert.equal(safeStem('bang_gia_2026.PDF'), 'bang_gia_2026')
  })

  it('keeps names without a pdf extension', () => {
    assert.equal(safeStem('folder'), 'folder')
  })
})

describe('name guards', () => {
  it('recognises PDFs case-insensitively', () => {
    assert.equal(isPdfName('a.pdf'), true)
    assert.equal(isPdfName('a.PDF'), true)
    assert.equal(isPdfName('a.png'), false)
  })

  it('recognises png/jpg/jpeg images only', () => {
    assert.equal(isImageName('a.png'), true)
    assert.equal(isImageName('a.JPG'), true)
    assert.equal(isImageName('a.jpeg'), true)
    assert.equal(isImageName('a.webp'), false)
  })
})

describe('naturalCompare', () => {
  it('orders page_2 before page_10', () => {
    const sorted = ['page_10.pdf', 'page_2.pdf', 'page_1.pdf'].sort(naturalCompare)
    assert.deepEqual(sorted, ['page_1.pdf', 'page_2.pdf', 'page_10.pdf'])
  })
})

describe('safeRelativePath', () => {
  it('normalises separators and keeps nesting', () => {
    assert.equal(safeRelativePath('a\\b/c.pdf'), 'a/b/c.pdf')
  })

  it('accepts the empty root', () => {
    assert.equal(safeRelativePath(''), '')
  })

  it('rejects traversal with a code the API can translate', () => {
    assert.throws(() => safeRelativePath('../etc'), /PDF_INVALID_PATH/)
    assert.throws(() => safeRelativePath('a/./b'), /PDF_INVALID_PATH/)
  })

  it('rejects a component that sanitises to nothing', () => {
    assert.throws(() => safeRelativePath('a/.../b'), /PDF_INVALID_PATH/)
  })
})
